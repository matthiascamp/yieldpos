#!/usr/bin/env python3
"""
Mettler Toledo VIVA Scale Reader
Reads live weight via the 8217 Mettler Toledo protocol over a serial port.

Usage:
    python scale_reader.py COM2
    python scale_reader.py /dev/tty.usbserial-1234
    python scale_reader.py --scan
    python scale_reader.py COM3 --baud 9600 --poll 0.5
"""

import argparse
import json
import sys
import threading
import time

import serial
import serial.tools.list_ports

# 8217 protocol serial defaults
DEFAULT_BAUD = 9600
DATA_BITS = serial.SEVENBITS
PARITY = serial.PARITY_EVEN
STOP_BITS = serial.STOPBITS_ONE

# Timing
# The 8217 protocol requires >= 200ms between successive command sends — that's
# the inter-request floor. There's no need to sleep BEFORE reading: read_response
# already waits up to READ_TIMEOUT for data. So we drop the pre-read delay and
# enforce the 200ms floor as the inter-cycle poll instead.
DEFAULT_POLL = 0.2       # seconds between polls (protocol min = 200ms)
READ_TIMEOUT = 3.0       # seconds to wait for response (scale waits for stability)
POST_SEND_DELAY = 0.0    # not needed — read_response handles its own waiting

# Probe-only timings: scale answers in <100ms at 9600 baud, so we can be
# aggressive here. A dead port costs PROBE_ATTEMPTS * (PROBE_POST_SEND + PROBE_TIMEOUT + PROBE_RETRY_SLEEP).
PROBE_TIMEOUT = 0.5
PROBE_POST_SEND_DELAY = 0.05
PROBE_RETRY_SLEEP = 0.1
PROBE_ATTEMPTS = 2

# Protocol constants
STX = 0x02
CR = 0x0D
# Empirical verification on this Viva: uppercase 'W' returns a weight frame
# (e.g. STX "00.170" CR). Lowercase 'w' returns only a status frame. Earlier
# guidance to use lowercase was wrong for this scale.
WEIGHT_CMD = b"W"
LB_TO_KG = 0.45359237

# Status byte bitmasks
ST_NET       = 0x01
ST_NEGATIVE  = 0x02
ST_OVERRANGE = 0x04
ST_MOTION    = 0x08
ST_KG        = 0x10
ST_FIXED     = 0x20
ST_POWERUP   = 0x40


def decode_status_byte(val):
    """Decode 8217 status byte into issues (problems) and info (metadata)."""
    issues = []
    info = []

    if val & ST_POWERUP:
        issues.append("Scale powering up")
    if val & ST_MOTION:
        issues.append("Scale in motion")
    if val & ST_OVERRANGE:
        issues.append("Out of range (over capacity or under zero)")

    if val & ST_NEGATIVE:
        info.append("Negative")
    if val & ST_NET:
        info.append("Net")
    info.append("kg" if val & ST_KG else "lb")

    return issues, info


def parse_response(data):
    """
    Parse a raw response from the scale.

    8217 weight response:  <STX> <weight digits> [N] <CR>
    8217 status response:  <STX> ? <status byte> <CR>
    """
    if not data:
        return {"type": "error", "message": "No response (timeout)"}

    stx = data.find(bytes([STX]))
    if stx == -1:
        return {"type": "error", "message": f"Bad response (no STX): {data!r}"}

    cr = data.find(bytes([CR]), stx)
    if cr == -1:
        return {"type": "error", "message": f"Incomplete response (no CR): {data!r}"}

    payload = data[stx + 1 : cr]
    if not payload:
        return {"type": "error", "message": "Empty payload"}

    # Status/error response: ?<byte>
    if payload[0:1] == b"?":
        if len(payload) >= 2:
            issues, info = decode_status_byte(payload[1])
            return {"type": "status", "issues": issues, "info": info}
        return {"type": "error", "message": "Unknown status response"}

    # Weight response
    text = payload.decode("ascii", errors="replace").strip()
    net = text.endswith("N")
    if net:
        text = text[:-1].strip()

    result = {"type": "weight", "value": text, "net": net}

    try:
        result["numeric"] = float(text)
    except ValueError:
        pass

    return result


def read_response(ser, timeout=READ_TIMEOUT, should_stop=None):
    """Read bytes from serial until CR is found or timeout expires."""
    buf = b""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if should_stop and should_stop():
            break
        waiting = ser.in_waiting
        if waiting:
            chunk = ser.read(waiting)
            buf += chunk
            if CR in chunk:
                return buf
        else:
            time.sleep(0.02)
    return buf


def open_port(port, baud):
    """Open the serial port with 8217 protocol settings."""
    try:
        ser = serial.Serial(
            port=port,
            baudrate=baud,
            bytesize=DATA_BITS,
            parity=PARITY,
            stopbits=STOP_BITS,
            timeout=READ_TIMEOUT,
            xonxoff=False,
            rtscts=False,
            dsrdtr=False,
        )
        return ser
    except serial.SerialException as e:
        return e


def format_weight(parsed):
    """Format a parsed weight result for display."""
    suffix = " (Net)" if parsed["net"] else ""
    return f"{parsed['value']}{suffix}"


def scan_ports():
    """List all available serial ports with details."""
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("No serial ports found.")
        print("\nIf the scale is connected via USB-to-serial adapter, check that:")
        print("  - The adapter is plugged in")
        print("  - Drivers are installed (FTDI drivers for most adapters)")
        return []

    print(f"Found {len(ports)} serial port(s):\n")
    for p in ports:
        print(f"  {p.device}")
        if p.description and p.description != "n/a":
            print(f"    Description: {p.description}")
        if p.manufacturer:
            print(f"    Manufacturer: {p.manufacturer}")
        if p.hwid and p.hwid != "n/a":
            print(f"    Hardware ID: {p.hwid}")
        print()
    return ports


def diagnose_connection(port, baud):
    """
    Try to talk to the scale and diagnose what's wrong if it doesn't respond.
    Returns (ser, None) on success or (None, diagnosis_string) on failure.
    """
    print(f"Probing {port}...")

    result = open_port(port, baud)
    if isinstance(result, Exception):
        return None, f"Cannot open port: {result}"

    ser = result

    # Try sending 'W' a few times with the correct 7E1 settings
    for attempt in range(PROBE_ATTEMPTS):
        ser.reset_input_buffer()
        ser.write(WEIGHT_CMD)
        time.sleep(PROBE_POST_SEND_DELAY)
        raw = read_response(ser, timeout=PROBE_TIMEOUT)

        if raw:
            parsed = parse_response(raw)
            if parsed["type"] == "weight":
                print(f"  Scale found! Got weight: {format_weight(parsed)}")
                return ser, None
            elif parsed["type"] == "status":
                if parsed["issues"]:
                    print(f"  Scale found! Status: {', '.join(parsed['issues'])}")
                else:
                    print(f"  Scale found! Status: {', '.join(parsed['info'])}")
                return ser, None
            else:
                # Got data but couldn't parse it as 8217 protocol
                has_printable = any(32 <= b < 127 for b in raw)
                if has_printable:
                    printable = raw.decode("ascii", errors="replace")
                    return None, (
                        f"Got data but not 8217 protocol: {raw!r}\n"
                        f"  Printable: {printable}\n"
                        f"  This could mean:\n"
                        f"    - The scale is set to a different protocol (not 8217 Mettler Toledo)\n"
                        f"    - Wrong baud rate or parity settings\n"
                        f"    - The cable is wired incorrectly"
                    )
                else:
                    return None, (
                        f"Got garbage data: {raw.hex()}\n"
                        f"  This usually means:\n"
                        f"    - Wrong baud rate (try --baud 1200, 2400, or 4800)\n"
                        f"    - Wrong parity/data bits (scale might not be on default 7-E-1)\n"
                        f"    - Electrical noise on the cable"
                    )

        time.sleep(PROBE_RETRY_SLEEP)

    ser.close()

    # Port opened fine but no response at all
    return None, (
        f"Port opened but the scale did not respond to any of {PROBE_ATTEMPTS} attempts.\n"
        "  Possible causes (most likely first):\n"
        "    1. Wrong cable -- you need a DB-9 serial cable, NOT VGA.\n"
        "       DB-9 has 2 rows of pins (5+4=9). VGA has 3 rows (8+5+3=16 pins).\n"
        "       If your connector has 3 rows of pins, it's VGA and won't work.\n"
        "    2. Need a null modem (crossover) cable -- TX and RX must be swapped.\n"
        "       A straight-through serial cable won't work because both the PC\n"
        "       and scale transmit on the same pin.\n"
        "    3. Wrong port -- the scale might be on a different port.\n"
        "       Run: python scale_reader.py --scan\n"
        "    4. Scale is powered off or not connected.\n"
        "    5. USB-to-serial adapter not recognized (try a different one)."
    )


def main():
    parser = argparse.ArgumentParser(
        description="Read live weight from a Mettler Toledo VIVA scale (8217 protocol)"
    )
    parser.add_argument(
        "port",
        nargs="?",
        default=None,
        help="Serial port, e.g. COM2 (Windows) or /dev/tty.usbserial-XXXX (macOS)",
    )
    parser.add_argument(
        "--baud",
        type=int,
        default=DEFAULT_BAUD,
        help=f"Baud rate (default: {DEFAULT_BAUD})",
    )
    parser.add_argument(
        "--poll",
        type=float,
        default=DEFAULT_POLL,
        help=f"Poll interval in seconds (default: {DEFAULT_POLL}, min 0.3)",
    )
    parser.add_argument(
        "--scan",
        action="store_true",
        help="Scan all serial ports and try to find the scale",
    )
    parser.add_argument(
        "--lines",
        action="store_true",
        help="Print each changed reading on its own line (good for piping/logging). "
             "Auto-enabled when stdout is not a terminal.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit one JSON object per poll on stdout. For machine consumers "
             "(e.g. the Crisp POS Electron app). All chatter goes to stderr.",
    )
    args = parser.parse_args()

    line_mode = args.lines or args.json or not sys.stdout.isatty()
    json_mode = args.json
    # In json mode, route human-readable output to stderr so stdout is pure JSON-lines.
    log = (lambda *a, **kw: print(*a, **kw, file=sys.stderr, flush=True)) if json_mode else print

    # --scan mode: list ports and probe each one
    if args.scan or args.port is None:
        print("Mettler Toledo VIVA Scale -- Port Scanner\n")
        ports = scan_ports()

        if not ports:
            sys.exit(1)

        # Filter out Bluetooth and other non-physical ports
        candidates = [
            p for p in ports
            if "bluetooth" not in p.device.lower()
            and "bt" not in p.description.lower()
        ]
        if not candidates:
            candidates = ports

        print("Probing each port for a scale...\n")
        for p in candidates:
            ser, diagnosis = diagnose_connection(p.device, args.baud)
            if ser:
                print(f"\nScale detected on {p.device}! Starting live reader...\n")
                args.port = p.device
                break
            else:
                print(f"  {p.device}: {diagnosis.splitlines()[0]}\n")
        else:
            print("No scale found on any port.")
            print("Make sure the scale is on and connected with the correct cable.")
            sys.exit(1)

        if not args.port:
            sys.exit(1)

    if args.poll < 0.2:
        log(f"WARNING: Poll interval {args.poll}s is below the 200ms protocol minimum. Using 0.2s.")
        args.poll = 0.2

    log(f"Mettler Toledo VIVA Scale Reader")
    log(f"Port:     {args.port}")
    log(f"Settings: {args.baud} baud, 7-E-1, no flow control")
    log(f"Polling:  every {args.poll}s")
    log(f"Press Ctrl+C to stop\n")

    # If we already have an open connection from scanning, use it; otherwise open fresh
    if "ser" not in dir() or not isinstance(ser, serial.Serial) or not ser.is_open:
        ser, diagnosis = diagnose_connection(args.port, args.baud)
        if not ser:
            log(f"ALERT: {diagnosis}")
            sys.exit(1)

    consecutive_failures = 0
    max_failures = 10
    last_emitted = None  # for line_mode dedup
    start_time = time.monotonic()
    last_emit_time = start_time
    stop_requested = False

    def watch_parent_stdin():
        nonlocal stop_requested
        try:
            while sys.stdin.readline() != "":
                pass
        except Exception:
            pass
        stop_requested = True

    def emit_human(text):
        nonlocal last_emitted, last_emit_time
        now = time.monotonic()
        elapsed = now - start_time
        delta = now - last_emit_time
        stamp = f"[{elapsed:6.2f}s +{delta:5.2f}s]"
        if line_mode:
            if text != last_emitted:
                print(f"{stamp} {text}", flush=True)
                last_emitted = text
                last_emit_time = now
        else:
            print(f"\r{stamp} {text}              ", end="", flush=True)
            last_emit_time = now

    def emit_json(obj):
        # One JSON object per line on stdout. Includes timestamp so consumers
        # can detect staleness.
        obj["ts"] = time.time()
        print(json.dumps(obj), flush=True)

    def emit_reading(parsed):
        """Translate a parse_response() result into a normalised event.

        We always emit unit="kg". The 8217 status byte's KG bit isn't reliable
        across Viva firmware revs and the renderer should never show "lb" —
        AU retail shop, weight digits already match the scale's own display.
        """
        if json_mode:
            if parsed["type"] == "weight":
                val = parsed.get("numeric")
                emit_json({
                    "type": "weight",
                    "weight": val if val is not None else 0.0,
                    "value": parsed.get("value"),
                    "unit": "kg",
                    "net": parsed.get("net", False),
                    "stable": True,
                    "inMotion": False,
                })
            elif parsed["type"] == "status":
                issues = parsed.get("issues", [])
                info = parsed.get("info", [])
                in_motion = any("motion" in s.lower() for s in issues)
                powerup = any("powering up" in s.lower() for s in issues)
                overrange = any("range" in s.lower() for s in issues)
                emit_json({
                    "type": "status",
                    "issues": issues,
                    "info": info,
                    "stable": False,
                    "inMotion": in_motion,
                    "powerup": powerup,
                    "overrange": overrange,
                    "unit": "kg",
                })
            else:
                emit_json({"type": "error", "message": parsed.get("message", "unknown")})
        else:
            if parsed["type"] == "weight":
                emit_human(f"Weight: {format_weight(parsed)}")
            elif parsed["type"] == "status":
                if parsed["issues"]:
                    emit_human(f"[{', '.join(parsed['issues'])}]")
                else:
                    emit_human(f"Status: {', '.join(parsed['info'])}")
            else:
                emit_human(f"WARNING: {parsed['message']}")

    if not sys.stdin.isatty():
        threading.Thread(target=watch_parent_stdin, daemon=True).start()

    try:
        while not stop_requested:
            try:
                ser.reset_input_buffer()
                ser.write(WEIGHT_CMD)
                raw = read_response(ser, should_stop=lambda: stop_requested)
                if stop_requested:
                    break
                parsed = parse_response(raw)

                if parsed["type"] == "weight":
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1

                emit_reading(parsed)

                if consecutive_failures == max_failures:
                    log(f"\n\nALERT: {max_failures} consecutive read failures.")
                    log("  Check: cable connection, scale power, correct port.")
                    consecutive_failures = 0

            except serial.SerialException as e:
                consecutive_failures += 1
                log(f"\n  ALERT: Serial error: {e}")
                if consecutive_failures >= max_failures:
                    log("\nALERT: Too many serial errors. Attempting to reconnect...")
                    ser.close()
                    time.sleep(2)
                    ser, diagnosis = diagnose_connection(args.port, args.baud)
                    if not ser:
                        log(f"ALERT: Reconnect failed: {diagnosis}")
                        log("Exiting.")
                        sys.exit(1)
                    consecutive_failures = 0
                    log("Reconnected.\n")

            time.sleep(args.poll)

    except KeyboardInterrupt:
        log("\n\nStopped by user.")
    finally:
        if ser.is_open:
            ser.close()
        log("Port closed.")


if __name__ == "__main__":
    main()
