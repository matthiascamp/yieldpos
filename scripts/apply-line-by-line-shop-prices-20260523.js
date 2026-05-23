const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const bundledDbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const runtimeDbPath = path.join(process.env.APPDATA || '', 'YieldPOS Client', 'crisp-pos.sqlite')
const migrationKey = 'spoken_shop_prices_20260523_line_audit_v1'

const CATEGORIES = [
  ['cat-apples', 'Apples', 50, '#dc2626'],
  ['cat-bananas', 'Bananas', 57, '#eab308'],
  ['cat-berries', 'Berries', 130, '#8b2252'],
  ['cat-broccoli', 'Broccoli', 83, '#15803d'],
  ['cat-bucket-specials', 'Bucket Specials', 140, '#d97706'],
  ['cat-cabbage', 'Cabbage', 77, '#16a34a'],
  ['cat-capsicum', 'Capsicum', 35, '#ef4444'],
  ['cat-fruit', 'Fruit', 10, '#22c55e'],
  ['cat-garlic', 'Garlic', 81, '#d6d3d1'],
  ['cat-grapes', 'Grapes', 58, '#6d28d9'],
  ['cat-kiwi-fruit', 'Kiwi Fruit', 59, '#84cc16'],
  ['cat-lemons', 'Lemons', 56, '#facc15'],
  ['cat-lettuces', 'Lettuces', 78, '#22c55e'],
  ['cat-mandarins', 'Mandarins', 54, '#f97316'],
  ['cat-melons', 'Melons', 60, '#16a34a'],
  ['cat-mushrooms', 'Mushrooms', 82, '#78716c'],
  ['cat-onions', 'Onions', 76, '#7c2d12'],
  ['cat-oranges', 'Oranges', 55, '#f97316'],
  ['cat-pears', 'Pears', 61, '#84cc16'],
  ['cat-potatoes', 'Potatoes', 75, '#a16207'],
  ['cat-pumpkins', 'Pumpkins', 79, '#f97316'],
  ['cat-sweet-potatoes', 'Sweet Potatoes', 80, '#ea580c'],
  ['cat-tomatoes', 'Tomatoes', 85, '#dc2626'],
  ['cat-tropical', 'Tropical', 131, '#e87830'],
  ['cat-veg', 'Vegetables', 20, '#4fbd77'],
  ['cat-zucchini', 'Zucchini', 84, '#166534']
]

const PRODUCTS = [
  ['p-kb-pg25-green-cab', 'Green Cabbage', 'cat-cabbage', 3.99, 'each', '20108'],
  ['p-kb-pg25-red-cab', 'Red Cabbage', 'cat-cabbage', 3.99, 'each', '20109'],
  ['p-kb-pg25-wombok', 'Wombok', 'cat-cabbage', 1.49, 'each', '20132'],
  ['p-open-pg4-cabbage', 'Wombok', 'cat-cabbage', 1.49, 'each', '20111'],
  ['0b103e84-ed33-4f38-a207-011483113059', 'Sugarloaf Cabbage', 'cat-cabbage', 2.99, 'each', '20215'],
  ['p-kb-pg23-beetroot-kg', 'Beetroot', 'cat-veg', 4.99, 'each', '20128'],
  ['p-kb-pg4-cauliflower', 'Cauliflower', 'cat-veg', 1.49, 'each', '20050'],
  ['p-open-pg4-cauliflower', 'Cauliflower', 'cat-veg', 1.49, 'each', null],
  ['p-kb-pg5-kale', 'Kale', 'cat-veg', 3.99, 'each', '20060'],
  ['p-kb-pg29-btn0', 'Iceberg Lettuce', 'cat-lettuces', 1.49, 'each', '3394'],
  ['p-open-pg29-btn0', 'Iceberg Lettuce', 'cat-lettuces', 1.49, 'each', '21022'],
  ['262c2a44-c9d9-4019-a754-4aebf992a451', 'Cos Lettuce', 'cat-lettuces', 4.99, 'each', '9338340001892'],
  ['daf02aa0-9015-4887-95f4-5401a7599724', 'Fancy Lettuce', 'cat-lettuces', 3.99, 'each', '20117'],
  ['2b0bddfc-0bbe-4534-8fe2-28ca807ccf77', 'Twin Cos Bag', 'cat-lettuces', 3.99, 'each', '20118'],
  ['p-kb-pg5-lettuce-bags', 'Twin Cos Pack', 'cat-lettuces', 3.99, 'each', '20119'],

  ['p-kb-pg4-celery', 'Whole Celery', 'cat-veg', 2.99, 'each', '20051'],
  ['p-kb-pg5-silverbeet', 'Silverbeet', 'cat-veg', 3.99, 'each', '20105'],
  ['p-kb-pg5-leeks', 'Leeks', 'cat-veg', 3.49, 'each', '20104'],
  ['p-kb-pg5-shallots', 'Shallots', 'cat-veg', 1.99, 'each', '20103'],
  ['p-kb-pg4-asian-vege', 'Asian Vege', 'cat-veg', 2.99, 'each', '20102'],
  ['p-kb-pg5-herbs', 'Herbs', 'cat-veg', 3.89, 'each', '20101'],
  ['p-kb-pg5-swedes', 'Swedes', 'cat-veg', 5.89, 'kg', '20071'],
  ['p-kb-pg5-turnip', 'Turnip', 'cat-veg', 5.89, 'kg', '20072'],
  ['p-kb-pg4-ginger', 'Ginger', 'cat-veg', 34.99, 'kg', '20058'],
  ['p-kb-pg5-parsnip', 'Parsnip', 'cat-veg', 12.99, 'kg', '20065'],
  ['p-kb-pg4-chokos', 'Chokos', 'cat-veg', 6.99, 'kg', '20053'],
  ['p-shop-bitter-gourd', 'Bitter Gourd', 'cat-veg', 5.99, 'kg', null],
  ['71cad34a-3ab1-4640-854f-4ec2192cc277', 'Bitter Gourd', 'cat-veg', 5.99, 'kg', '20205'],
  ['p-broccoli', 'Broccoli', 'cat-broccoli', 5.59, 'kg', '4060'],
  ['p-open-pg4-broccoli', 'Broccoli', 'cat-veg', 5.59, 'kg', null],
  ['p-kb-pg4-eggplant', 'Eggplant', 'cat-veg', 5.99, 'kg', '20056'],
  ['dfa6a675-e1e9-4e5e-b281-6cf7d0bd2d2d', 'Broccolini', 'cat-broccoli', 3.99, 'each', '20203'],
  ['p-kb-pg4-brussels', 'Brussel Sprouts', 'cat-veg', 12.99, 'kg', '20048'],
  ['p-kb-pg27-red-chilli', 'Red Chilli', 'cat-veg', 12.90, 'kg', '20136'],
  ['p-kb-pg4-asparagus', 'Asparagus', 'cat-veg', 4.99, 'each', '20045'],
  ['p-open-pg5-snow-peas', 'Snow Peas', 'cat-veg', 24.99, 'kg', '21009'],
  ['p-open-pg4-leb-eggplant', 'Leb Eggplant', 'cat-veg', 9.99, 'kg', '21008'],
  ['p-kb-pg4-corn', 'Corn', 'cat-veg', 0.99, 'each', '20054'],
  ['p-open-pg4-corn', 'Corn', 'cat-veg', 0.99, 'each', null],
  ['p-kb-pg4-fennel', 'Fennel', 'cat-veg', 2.69, 'each', '20057'],
  ['p-kb-pg30-button', 'Button Mushrooms', 'cat-mushrooms', 14.90, 'kg', '20148'],
  ['p-kb-pg30-flat-mush', 'Flat Mushroom', 'cat-mushrooms', 14.90, 'kg', '20130'],
  ['p-kb-pg30-swiss-brown', 'Swiss Brown Mushroom', 'cat-mushrooms', 16.90, 'kg', '20146'],
  ['p-open-pg36-btn1', 'Zucchini', 'cat-zucchini', 6.99, 'kg', '40042'],
  ['p-kb-pg36-btn0', 'Zucchini', 'cat-zucchini', 6.99, 'kg', '20153'],
  ['p-capsicum-r', 'Red Capsicum', 'cat-capsicum', 5.99, 'kg', '4088'],
  ['p-kb-pg26-green-cap', 'Green Capsicum', 'cat-capsicum', 7.99, 'kg', '20134'],
  ['p-kb-pg26-yellow-cap', 'Yellow Capsicum', 'cat-capsicum', 8.99, 'kg', '20135'],
  ['54a502c2-f93d-4696-b772-397fa640cef6', 'Capsicum Special', 'cat-bucket-specials', 1.49, 'kg', '20244'],
  ['p-kb-pg4-beans', 'Beans', 'cat-veg', 12.99, 'kg', '20123'],
  ['p-open-pg4-carrots', 'Carrots Loose', 'cat-veg', 3.69, 'kg', '21006'],
  ['18f58870-b825-4a16-afa2-260b8f680539', 'Carrot Punnet', 'cat-veg', 3.99, 'each', '20122'],
  ['0b323105-7584-48af-ae1d-85cc67d1b5d1', 'Carrot Bag 1kg', 'cat-veg', 2.69, 'each', '9318441000000', '9318441000000'],
  ['p-kb-pg4-carrot-bag', 'Carrot Bag 1kg', 'cat-veg', 2.69, 'each', '20120'],

  ['p-kb-pg28-garlic-kg', 'Garlic', 'cat-garlic', 28.90, 'kg', '20140'],
  ['497dd7e9-cfbc-46bb-abc3-f4c75b6a9f82', 'Garlic Bag', 'cat-garlic', 4.99, 'each', '20210'],
  ['p-kb-pg31-btn0', 'Brown Onion Bag 2kg', 'cat-onions', 3.99, 'each', '2451'],
  ['p-shop-brown-onion-bag-1kg', 'Brown Onion Bag 1kg', 'cat-onions', 1.49, 'each', '20411'],
  ['p-open-pg31-btn1', 'Brown Onion', 'cat-onions', 2.99, 'kg', '4663'],
  ['p-open-pg31-btn5', 'Red Salad Onion', 'cat-onions', 4.99, 'kg', '4089'],
  ['ae18e675-c545-4e3e-a6da-9b2f06165ff3', 'White Onion', 'cat-onions', 7.99, 'kg', '20206'],
  ['eecb04fd-5a3c-4e8c-b1cd-090b7ab969a9', 'Pickling Onion Bag 1kg', 'cat-onions', 3.49, 'each', '2434'],
  ['f3f52d9a-d588-4fb8-9e6c-470c08df7e49', 'Pickling Onion Bag 1kg', 'cat-onions', 3.49, 'each', '20209'],
  ['1bcb5668-b0f2-42e4-a787-aa35f7c55c65', 'Red Onion Bag 1kg', 'cat-onions', 2.99, 'each', '20208'],
  ['p-kb-pg32-potato-bag', 'Potato Bag 3kg', 'cat-potatoes', 5.99, 'each', '20158'],
  ['p-shop-white-washed-potato-bag-3kg', 'White Washed Potato Bag 3kg', 'cat-potatoes', 5.99, 'each', '20412'],
  ['0becaa58-93cd-49b0-8f48-8e0f62050aca', 'Brushed Potatoes', 'cat-potatoes', 2.99, 'kg', '21014'],
  ['fa57a10a-fd3d-4701-a4fd-422d06bbd44b', 'Washed Potatoes', 'cat-potatoes', 5.59, 'kg', '21015'],
  ['p-kb-pg32-btn2', 'Chat Potatoes 1kg Bag', 'cat-potatoes', 4.89, 'each', '2764'],
  ['p-kb-pg32-chat', 'Red Chat Potatoes 1kg Bag', 'cat-potatoes', 4.89, 'each', '20157'],
  ['f212c8ff-a290-4f5b-91cc-1f52239e568d', 'Kipfler Potatoes', 'cat-potatoes', 7.99, 'kg', '2531'],
  ['p-kb-pg34-btn0', 'Gold Sweet Potato', 'cat-sweet-potatoes', 3.99, 'kg', null],
  ['p-kb-pg34-btn1', 'Red Sweet Potato', 'cat-sweet-potatoes', 6.99, 'kg', '2551'],
  ['p-kb-pg34-btn2', 'White Sweet Potato', 'cat-sweet-potatoes', 6.99, 'kg', '25081'],
  ['p-open-pg34-btn3', 'Outside Gold Sweet Potato', 'cat-bucket-specials', 1.49, 'kg', '20394'],
  ['p-open-pg33-btn1', 'Jap Pumpkin', 'cat-pumpkins', 2.49, 'kg', '2557'],
  ['4890494b-e31f-4b6d-a391-319f0196b424', 'Jap Pumpkin Cut', 'cat-pumpkins', 2.69, 'kg', '21023'],
  ['p-open-pg33-btn0', 'Butternut Pumpkin', 'cat-pumpkins', 2.49, 'kg', '2555'],
  ['0c547140-0fcb-4b06-9288-de9d2b8aee11', 'Butternut Pumpkin Cut', 'cat-pumpkins', 2.99, 'kg', '21024'],
  ['p-kb-pg33-btn2', 'Jarra Pumpkin', 'cat-pumpkins', 2.49, 'kg', '2621'],
  ['ecb0905f-bd84-470e-bce1-780c6e5fced4', 'Jarra Pumpkin Cut', 'cat-pumpkins', 2.99, 'kg', '21025'],

  ['price-list-4011', 'Large Pink Lady Apple', 'cat-apples', 8.99, 'kg', '21026'],
  ['p-kb-pg7-btn8', 'Large Royal Gala Apple', 'cat-apples', 6.89, 'kg', '20303'],
  ['p-kb-pg7-btn7', 'Large Granny Smith Apple', 'cat-apples', 5.99, 'kg', '4071'],
  ['ae73525e-3d9f-4992-bfc9-1c0e9f299d4f', 'Large Granny Smith Apple', 'cat-apples', 5.99, 'kg', '20305'],
  ['2b95e9d9-c52b-498a-9345-3e5aa7c89435', 'Kanzi Apple', 'cat-apples', 7.99, 'kg', '20308'],
  ['p-kb-pg7-red-delicious', 'Red Delicious Apple', 'cat-apples', 5.89, 'kg', '20310'],
  ['p-shop-sassy-apple', 'Sassy Apple', 'cat-apples', 6.49, 'kg', '20313'],
  ['p-kb-pg7-btn4', 'Jazz Apple', 'cat-apples', 6.89, 'kg', '20309'],
  ['p-shop-missile-apple', 'Missile Apple', 'cat-apples', 12.99, 'kg', '20314'],
  ['p-kb-pg7-btn10', 'Granny Smith Bucket', 'cat-bucket-specials', 1.99, 'kg', '20307'],
  ['p-kb-pg21-packham', 'Packham Pear', 'cat-pears', 5.89, 'kg', '20315'],
  ['p-open-pg21-btn3', 'Williams Pear', 'cat-pears', 5.89, 'kg', '20316'],
  ['p-kb-pg21-nashi', 'Nashi Pear', 'cat-pears', 1.99, 'each', '20317'],
  ['p-orange-navel', 'Navel Orange', 'cat-oranges', 6.99, 'kg', '20318'],
  ['p-open-pg19-btn4', 'Cara Cara Orange', 'cat-oranges', 5.89, 'kg', '20319'],
  ['p-open-pg19-btn1', 'Valencia Orange', 'cat-oranges', 3.89, 'kg', '20320'],
  ['p-open-pg19-btn5', 'Orange Bag 3kg', 'cat-oranges', 6.99, 'each', '20321'],
  ['p-kb-pg15-imperial', 'Imperial Mandarin', 'cat-mandarins', 4.89, 'kg', '20322'],
  ['p-kb-pg15-afourer', 'Afourer Mandarin', 'cat-mandarins', 4.99, 'kg', '20323'],
  ['p-kb-pg13-btn0', 'Lemons', 'cat-lemons', 5.99, 'kg', '8623'],
  ['p-kb-pg13-btn1', 'Bagged Lemons', 'cat-lemons', 1.99, 'kg', '86232'],
  ['p-shop-lemon-bucket', 'Juicy Lemon Bucket', 'cat-bucket-specials', 1.99, 'kg', '20327'],
  ['p-kb-pg14-limes-ea', 'Limes', 'cat-fruit', 1.99, 'each', '20328'],
  ['p-open-pg14-btn1', 'Bagged Limes', 'cat-fruit', 2.99, 'kg', '20329'],
  ['p-shop-limes-bucket', 'Limes Bucket', 'cat-bucket-specials', 2.99, 'kg', '20330'],
  ['p-open-pg2-grapefruit', 'Grapefruit', 'cat-fruit', 3.99, 'kg', '21001'],
  ['p-kb-pg2-custard-apple', 'Custard Apple', 'cat-fruit', 12.99, 'kg', '20332'],
  ['p-kb-pg3-persimmons', 'Persimmons', 'cat-fruit', 12.99, 'kg', '20333'],
  ['p-kb-pg3-pomegranate', 'Pomegranate', 'cat-fruit', 4.89, 'each', '20334'],
  ['p-kb-pg3-passion-fruit', 'Passion Fruit', 'cat-fruit', 1.99, 'each', '20335'],
  ['p-kb-pg12-btn0', 'Regular Kiwi', 'cat-kiwi-fruit', 14.89, 'kg', '4612'],
  ['p-kb-pg12-btn1', 'Gold Kiwi', 'cat-kiwi-fruit', 2.89, 'each', '5088'],
  ['p-open-pg9-btn0', 'Hass Avocado', 'cat-fruit', 2.99, 'each', '20338'],
  ['ad3d72a1-947b-4b96-b651-fb6c0db98e35', 'Avocado Bag', 'cat-fruit', 1.49, 'kg', '20340'],
  ['p-kb-pg10-btn0', 'Cavendish Banana', 'cat-bananas', 4.99, 'kg', '4201'],
  ['p-kb-pg10-lady-finger', 'Lady Finger Banana', 'cat-bananas', 6.99, 'kg', '20342'],
  ['p-kb-pg10-btn2', 'Cavendish Banana Bucket', 'cat-bucket-specials', 2.49, 'kg', '20343'],
  ['p-kb-pg10-btn3', 'Lady Finger Banana Bucket', 'cat-bucket-specials', 1.99, 'kg', '20344'],
  ['p-kb-pg3-pineapple-xl', 'Extra Large Pineapple', 'cat-tropical', 7.99, 'each', '20345'],
  ['p-kb-pg3-pineapple-sm', 'Small Pineapple', 'cat-tropical', 3.99, 'each', '20346'],
  ['p-kb-pg3-pineapple-md', 'Small Pineapple', 'cat-tropical', 3.99, 'each', '20347'],
  ['p-kb-pg17-rockmelon', 'Rockmelon', 'cat-melons', 5.99, 'each', '20348'],
  ['p-kb-pg17-honeydew', 'Honeydew', 'cat-melons', 5.89, 'each', '20349'],
  ['p-kb-pg3-papaya', 'Papaya', 'cat-tropical', 5.99, 'kg', '20350'],
  ['p-kb-pg2-dragon-fruit', 'Dragon Fruit', 'cat-tropical', 15.99, 'kg', '20353'],
  ['p-shop-starfruit', 'Starfruit', 'cat-tropical', 2.49, 'each', '20410'],
  ['p-kb-pg11-green-grapes', 'Green Grapes', 'cat-grapes', 7.89, 'kg', '20087'],
  ['p-kb-pg11-red-grapes', 'Red Grapes', 'cat-grapes', 5.99, 'kg', '20088'],
  ['p-kb-pg11-black-grapes', 'Black Grapes', 'cat-grapes', 5.99, 'kg', '20089'],
  ['0edc2cf3-25af-474c-8246-7e5aa074f7e7', 'Blackberries', 'cat-berries', 5.99, 'each', '20358'],
  ['p-shop-blackberries-9354114689', 'Blackberries', 'cat-berries', 5.99, 'each', '9354114689', '9354114689'],
  ['34cd1e15-88cf-4335-8f0f-1ce1b9ca4ec2', 'Raspberries', 'cat-berries', 5.99, 'each', '20361'],
  ['p-shop-raspberries-93541244', 'Raspberries', 'cat-berries', 5.99, 'each', '93541244', '93541244'],
  ['a1f1424e-e7be-41c1-b365-ce8ced353f16', 'Raspberries', 'cat-berries', 5.99, 'each', '93541121', '93541121'],
  ['p-shop-blueberries-93536240', 'Blueberries', 'cat-berries', 8.99, 'each', '93536240', '93536240'],
  ['e55af428-537a-4de2-baae-913b80aa5b19', 'Blueberries', 'cat-berries', 8.99, 'each', '20357'],
  ['p-shop-strawberries-93080200444', 'Strawberries 250g', 'cat-berries', 5.99, 'each', '93080200444', '93080200444'],
  ['p-strawberry', 'Premium Strawberries', 'cat-berries', 5.99, 'each', '20359'],
  ['ba4e5558-f454-48ab-8110-fcff17e920a0', 'Strawberries 500g', 'cat-berries', 5.89, 'each', '9320802000482', '9320802000482'],

  ['p-kb-pg35-roma', 'Roma Tomato', 'cat-tomatoes', 7.89, 'kg', '20401'],
  ['e2aaef7b-68c3-4c8c-946d-d2e26606287f', 'Roma Egg Tomato', 'cat-tomatoes', 7.89, 'kg', '20402'],
  ['p-kb-pg35-truss', 'Truss Tomato', 'cat-tomatoes', 7.99, 'kg', '20403'],
  ['p-open-pg35-round-roma-bucket', 'Tomato Bucket', 'cat-bucket-specials', 1.49, 'kg', '20404'],
  ['p-open-pg35-roma-bucket', 'Roma Tomato Bucket', 'cat-bucket-specials', 1.49, 'kg', '20405'],
  ['f32a2d39-fb12-4b68-8855-00e2dd0ff869', 'Round Tomato', 'cat-tomatoes', 6.89, 'kg', '20406'],
  ['4352483e-e5f4-45f4-a9c9-3b2ec6fd522d', 'Petite Tomatoes 250g', 'cat-tomatoes', 1.49, 'each', '9317948008076', '9317948008076'],
  ['p-shop-petite-tomatoes', 'Petite Tomatoes 250g', 'cat-tomatoes', 1.49, 'each', '20413']
]

const EXACT_NAME_UPDATES = [
  ['CABBAGE DRUM HEAD EA', 3.99, 'each'],
  ['CABBAGE RED EA', 3.99, 'each'],
  ['CABBAGE SUGAR EA', 2.99, 'each'],
  ['CABBAGE CHINESE EA', 1.49, 'each'],
  ['CABBAGE SUGARLOAF WHOLE', 2.99, 'each'],
  ['BEETROOT BUNCH', 4.99, 'each'],
  ['CAULIFLOWER EA', 1.49, 'each'],
  ['CORN EACH', 0.99, 'each'],
  ['BROCCOLI KG', 5.59, 'kg'],
  ['Broccoli', 5.59, 'kg'],
  ['GARLIC KG', 28.90, 'kg'],
  ['(S) GARLIC AUSTRALIAN KG', 28.90, 'kg'],
  ['FRESH GARLIC BAGS', 4.99, 'each'],
  ['GARLIC BAG', 4.99, 'each'],
  ['ONIONS BROWN KG', 2.99, 'kg'],
  ['ONIONS WHITE KG', 7.99, 'kg'],
  ['ONIONS SALAD/SPANISH KG', 4.99, 'kg'],
  ['ONIONS PICKLING BAG 1KG', 3.49, 'each'],
  ['POTATOES BRUSHED 3KG', 5.99, 'each'],
  ['POTATOES BRUSHED KG', 2.99, 'kg'],
  ['POTATOES WASHED KG', 5.59, 'kg'],
  ['POTATOES CHAT 1KG BAG', 4.89, 'each'],
  ['CAPSICUM RED KG', 5.99, 'kg'],
  ['CAPSICUM GREEN KG', 7.99, 'kg'],
  ['CAPSCIUM YELLOW', 8.99, 'kg'],
  ['CAPSICUM YELLOW KG', 8.99, 'kg'],
  ['(S) CAPSICUM TRAY KG', 1.49, 'kg'],
  ['TOMATOES TRUSS KG', 7.99, 'kg'],
  ['TOMATOES TRUSS VINE KG', 7.99, 'kg'],
  ['TOMATOES ROMA KG', 7.89, 'kg'],
  ['TOMATOES ROMA/EGG  KG', 7.89, 'kg'],
  ['TOMATOES GOURMET KG', 6.89, 'kg'],
  ['GRAPEFRUIT RUBY RED KG', 3.99, 'kg'],
  ['IMPERIAL MANDARINS KG', 4.89, 'kg'],
  ['ORANGES NAVEL KG', 6.99, 'kg'],
  ['ORANGES VALENCIA KG', 3.89, 'kg'],
  ['CARA CARA ORANGE KG', 5.89, 'kg'],
  ['GRAPES RED SEEDLESS KG', 5.99, 'kg'],
  ['GRAPES BLACK SEEDLESS KG', 5.99, 'kg'],
  ['GRAPE WHITE SEEDLESS KG', 7.89, 'kg'],
  ['White Seedless', 7.89, 'kg'],
  ['Black Seedless', 5.99, 'kg'],
  ['Lady Finger', 6.99, 'kg'],
  ['Ladyfinger Bucket', 1.99, 'kg'],
  ['Imperial', 4.89, 'kg'],
  ['Packham', 5.89, 'kg'],
  ['Nashi', 1.99, 'each'],
  ['Truss', 7.99, 'kg'],
  ['Cucumbers', 1.99, 'each'],
  ['Sm Oranges Bag', 6.99, 'each'],
  ['Sm Pineapple', 3.99, 'each'],
  ['Med Pineapple', 3.99, 'each'],
  ['Xl Pineapple', 7.99, 'each'],
  ['Missile', 12.99, 'kg'],
  ['Blackberries', 5.99, 'each'],
  ['Raspberries', 5.99, 'each'],
  ['Blueberries', 8.99, 'each']
]

const BUTTON_LINKS = [
  ['pg4-asian-vege', 'ASIAN VEGE EA', 'p-kb-pg4-asian-vege'],
  ['pg4-asparagus', 'ASPARAGUS EA', 'p-kb-pg4-asparagus'],
  ['pg4-beans', 'BEANS KG', 'p-kb-pg4-beans'],
  ['pg4-beetroot', 'BEETROOT EA', 'p-kb-pg23-beetroot-kg'],
  ['pg4-bottle-gourd', 'BITTER\nGOURD KG', 'p-shop-bitter-gourd'],
  ['pg4-brussels', 'BRUSSEL SPROUTS KG', 'p-kb-pg4-brussels'],
  ['pg4-carrot-bag', 'CARROT BAG EA', '0b323105-7584-48af-ae1d-85cc67d1b5d1'],
  ['pg4-carrots', 'CARROTS LOOSE KG', 'p-open-pg4-carrots'],
  ['pg4-cauliflower', 'CAULIFLOWER EA', 'p-kb-pg4-cauliflower'],
  ['pg4-chokos', 'CHOKOS KG', 'p-kb-pg4-chokos'],
  ['pg4-corn', 'CORN EA', 'p-kb-pg4-corn'],
  ['pg4-cucumbers', 'CONTINENTAL\nCUCUMBER EA', 'p-kb-pg4-cucumbers'],
  ['pg4-eggplant', 'EGGPLANT KG', 'p-kb-pg4-eggplant'],
  ['pg4-fennel', 'FENNEL EA', 'p-kb-pg4-fennel'],
  ['pg4-ginger', 'GINGER KG', 'p-kb-pg4-ginger'],
  ['pg4-leb-eggplant', 'LEB EGGPLANT KG', 'p-open-pg4-leb-eggplant'],
  ['pg4-celery', 'WHOLE CELERY EA', 'p-kb-pg4-celery'],
  ['pg5-herbs', 'HERBS EA', 'p-kb-pg5-herbs'],
  ['pg5-kale', 'KALE EA', 'p-kb-pg5-kale'],
  ['pg5-leeks', 'LEEKS EA', 'p-kb-pg5-leeks'],
  ['pg5-lettuce-bags', 'TWIN COS\nPACK EA', '2b0bddfc-0bbe-4534-8fe2-28ca807ccf77'],
  ['pg5-parsnip', 'PARSNIP KG', 'p-kb-pg5-parsnip'],
  ['pg5-shallots', 'SHALLOTS EA', 'p-kb-pg5-shallots'],
  ['pg5-silverbeet', 'SILVERBEET EA', 'p-kb-pg5-silverbeet'],
  ['pg5-snow-peas', 'SNOW PEAS KG', 'p-open-pg5-snow-peas'],
  ['pg5-swedes', 'SWEDES KG', 'p-kb-pg5-swedes'],
  ['pg5-turnip', 'TURNIP KG', 'p-kb-pg5-turnip'],
  ['pg24-broccoli-kg', 'BROCCOLI KG', 'p-broccoli'],
  ['pg24-broccolini', 'BROCCOLINI\nBUNCH EA', 'dfa6a675-e1e9-4e5e-b281-6cf7d0bd2d2d'],
  ['pg25-green-cabbage', 'GREEN CABBAGE\nEA', 'p-kb-pg25-green-cab'],
  ['pg25-red-cabbage', 'RED CABBAGE EA', 'p-kb-pg25-red-cab'],
  ['pg25-sugarloaf', 'SUGARLOAF\nCABBAGE EA', '0b103e84-ed33-4f38-a207-011483113059'],
  ['pg25-wombok', 'WOMBOK\nEA', 'p-kb-pg25-wombok'],
  ['pg26-red-capsicum', 'RED CAPSICUM KG', 'p-capsicum-r'],
  ['pg26-green-capsicum', 'GREEN CAPSICUM KG', 'p-kb-pg26-green-cap'],
  ['pg26-yellow-capsicum', 'YELLOW\nCAPSICUM KG', 'p-kb-pg26-yellow-cap'],
  ['pg27-red-chilli', 'RED CHILLI KG', 'p-kb-pg27-red-chilli'],
  ['pg28-australian-garlic', 'AUSTRALIAN GARLIC KG', 'p-kb-pg28-garlic-kg'],
  ['pg28-mexican-garlic', 'GARLIC KG', 'p-kb-pg28-garlic-kg'],
  ['pg28-garlic-bag', 'GARLIC BAG EA', '497dd7e9-cfbc-46bb-abc3-f4c75b6a9f82'],
  ['pg29-btn0', 'ICEBERG LETTUCE EA', 'p-open-pg29-btn0'],
  ['pg29-btn1', 'COS LETTUCE EA', '262c2a44-c9d9-4019-a754-4aebf992a451'],
  ['pg29-btn2', 'FANCY LETTUCE EA', 'daf02aa0-9015-4887-95f4-5401a7599724'],
  ['pg30-btn0', 'BUTTON\nMUSHROOMS KG', 'p-kb-pg30-button'],
  ['pg30-btn2', 'FLAT MUSHROOM KG', 'p-kb-pg30-flat-mush'],
  ['pg30-btn1', 'SWISS BROWN\nMUSHROOM KG', 'p-kb-pg30-swiss-brown'],
  ['pg31-btn0', '2KG BROWN\nONION BAG', 'p-kb-pg31-btn0'],
  ['pg31-btn1', 'BROWN ONION KG', 'p-open-pg31-btn1'],
  ['pg31-btn2', 'RED SALAD\nONION KG', 'p-open-pg31-btn5'],
  ['pg31-btn3', 'ONION WHITE KG', 'ae18e675-c545-4e3e-a6da-9b2f06165ff3'],
  ['pg31-btn6', 'PICKLING BAG\n(SMALL ONIONS)', 'eecb04fd-5a3c-4e8c-b1cd-090b7ab969a9'],
  ['pg31-btn4', '1KG RED\nONION BAG', '1bcb5668-b0f2-42e4-a787-aa35f7c55c65'],
  ['pg31-brown-onion-1kg', '1KG BROWN\nONION BAG', 'p-shop-brown-onion-bag-1kg'],
  ['pg32-btn0', 'BRUSHED KG', '0becaa58-93cd-49b0-8f48-8e0f62050aca'],
  ['pg32-btn1', 'WASHED POTATOES\nWHITE KG', 'fa57a10a-fd3d-4701-a4fd-422d06bbd44b'],
  ['pg32-btn2', 'CHATS 1KG\nBAG EA', 'p-kb-pg32-btn2'],
  ['pg32-btn5', 'KIPFLER\nPOTATOES KG', 'f212c8ff-a290-4f5b-91cc-1f52239e568d'],
  ['pg32-btn4', 'WASHED POTATOES\nRED KG', 'fa57a10a-fd3d-4701-a4fd-422d06bbd44b'],
  ['pg32-red-chats', 'RED CHATS 1KG BAG EA', 'p-kb-pg32-chat'],
  ['pg32-btn3', 'KIPFLER\nPOTATOES KG', 'f212c8ff-a290-4f5b-91cc-1f52239e568d'],
  ['pg32-potato-bag-3kg', '3KG POTATO\nBAG EA', 'p-kb-pg32-potato-bag'],
  ['pg32-white-washed-bag-3kg', '3KG WHITE WASHED\nPOTATO BAG EA', 'p-shop-white-washed-potato-bag-3kg'],
  ['pg33-btn1', 'JAP KG', 'p-open-pg33-btn1'],
  ['pg33-btn4', 'JAP CUT KG', '4890494b-e31f-4b6d-a391-319f0196b424'],
  ['pg33-btn0', 'BUTTERNUT KG', 'p-open-pg33-btn0'],
  ['pg33-btn3', 'BUTTERNUT CUT KG', '0c547140-0fcb-4b06-9288-de9d2b8aee11'],
  ['pg33-btn2', 'JARRA KG', 'p-kb-pg33-btn2'],
  ['pg33-btn5', 'JARRA CUT\n(BLUEISH SKIN)', 'ecb0905f-bd84-470e-bce1-780c6e5fced4'],
  ['pg34-btn0', 'GOLD KG', 'p-kb-pg34-btn0'],
  ['pg34-btn1', 'RED SWEET\nPOTATO KG', 'p-kb-pg34-btn1'],
  ['pg34-btn2', 'WHITE SWEET\nPOTATO KG', 'p-kb-pg34-btn2'],
  ['pg34-btn3', 'GOLD KG\n(FROM OUTSIDE)', 'p-open-pg34-btn3'],
  ['pg35-roma-egg-kg', 'ROMA / EGG KG', 'e2aaef7b-68c3-4c8c-946d-d2e26606287f'],
  ['pg35-truss-kg', 'TRUSS\nTOMATO KG', 'p-kb-pg35-truss'],
  ['pg35-roma-bucket', 'ROMA TOMATO\nBUCKET KG', 'p-open-pg35-roma-bucket'],
  ['pg35-round-roma-bucket', 'TOMATO\nBUCKET KG', 'p-open-pg35-round-roma-bucket'],
  ['pg35-petite-tomatoes', 'PETITE\nTOMATOES EA', '4352483e-e5f4-45f4-a9c9-3b2ec6fd522d'],
  ['pg35-round-tomato', 'ROUND\nTOMATO KG', 'f32a2d39-fb12-4b68-8855-00e2dd0ff869'],
  ['pg36-btn0', 'ZUCCHINI KG', 'p-open-pg36-btn1'],

  ['pg2-custard-apple', 'CUSTARD APPLE KG', 'p-kb-pg2-custard-apple'],
  ['pg2-dragon-fruit', 'DRAGON FRUIT KG', 'p-kb-pg2-dragon-fruit'],
  ['pg2-grapefruit', 'GRAPEFRUIT\nKG', 'p-open-pg2-grapefruit'],
  ['pg3-pineapple-md', 'SMALL\nPINEAPPLE EA', 'p-kb-pg3-pineapple-md'],
  ['pg3-papaya', 'PAPAYA KG', 'p-kb-pg3-papaya'],
  ['pg3-passion-fruit', 'PASSION FRUIT EA', 'p-kb-pg3-passion-fruit'],
  ['pg3-persimmons', 'PERSIMMONS KG', 'p-kb-pg3-persimmons'],
  ['pg3-pomegranate', 'POMEGRANATE EA', 'p-kb-pg3-pomegranate'],
  ['pg3-pineapple-sm', 'SMALL\nPINEAPPLE EA', 'p-kb-pg3-pineapple-sm'],
  ['pg3-pineapple-xl', 'EXTRA LARGE\nPINEAPPLE EA', 'p-kb-pg3-pineapple-xl'],
  ['pg3-starfruit', 'STARFRUIT EA', 'p-shop-starfruit'],
  ['pg7-btn6', 'LARGE PINK LADY KG\n(SPOTTY)', 'price-list-4011'],
  ['pg7-btn7', 'LARGE GRANNY SMITH KG', 'p-kb-pg7-btn7'],
  ['pg7-btn8', 'LARGE ROYAL GALA KG\n(STRIPY)', 'p-kb-pg7-btn8'],
  ['pg7-btn0', 'SASSY\nAPPLE KG', 'p-shop-sassy-apple'],
  ['pg7-btn4', 'JAZZ APPLE KG', 'p-kb-pg7-btn4'],
  ['pg7-btn9', 'KANZI KG', '2b95e9d9-c52b-498a-9345-3e5aa7c89435'],
  ['pg7-btn11', 'RED DELICIOUS KG\n(DARK)', 'p-kb-pg7-red-delicious'],
  ['pg7-btn10', 'GRANNY SMITH\nBUCKET KG', 'p-kb-pg7-btn10'],
  ['pg7-missile-apple', 'MISSILE\nAPPLE KG', 'p-shop-missile-apple'],
  ['pg9-btn0', 'HASS AVOCADO EA', 'p-open-pg9-btn0'],
  ['pg9-btn4', 'AVOCADO BAG KG', 'ad3d72a1-947b-4b96-b651-fb6c0db98e35'],
  ['pg10-btn0', 'CAVENDISH\nBANANA KG', 'p-kb-pg10-btn0'],
  ['pg10-btn1', 'LADY FINGER\nBANANA KG', 'p-kb-pg10-lady-finger'],
  ['pg10-btn2', 'CAVENDISH\nBUCKET KG', 'p-kb-pg10-btn2'],
  ['pg10-btn3', 'LADY FINGER\nBUCKET KG', 'p-kb-pg10-btn3'],
  ['pg11-btn0', 'GREEN\nGRAPES KG', 'p-kb-pg11-green-grapes'],
  ['pg11-btn1', 'RED\nGRAPES KG', 'p-kb-pg11-red-grapes'],
  ['pg11-btn2', 'BLACK\nGRAPES KG', 'p-kb-pg11-black-grapes'],
  ['pg12-btn0', 'REGULAR KIWI KG', 'p-kb-pg12-btn0'],
  ['pg12-btn1', 'GOLD KIWI EA\n(ZESPRI STICKER)', 'p-kb-pg12-btn1'],
  ['pg13-btn0', 'LEMONS KG', 'p-kb-pg13-btn0'],
  ['pg13-btn1', 'BAGGED\nLEMONS KG', 'p-kb-pg13-btn1'],
  ['pg14-btn0', 'LIMES EA', 'p-kb-pg14-limes-ea'],
  ['pg14-btn1', 'BAGGED LIMES KG', 'p-open-pg14-btn1'],
  ['pg15-btn0', 'IMPERIAL\nMANDARIN KG', 'p-kb-pg15-imperial'],
  ['pg15-btn5', 'AFOURER KG\n(FLAT & MEDIUM)', 'p-kb-pg15-afourer'],
  ['pg17-btn0', 'ROCKMELON EA', 'p-kb-pg17-rockmelon'],
  ['pg17-btn1', 'HONEYDEW EA', 'p-kb-pg17-honeydew'],
  ['pg19-btn0', 'NAVEL ORANGE KG\n(DARK HOLE)', 'p-orange-navel'],
  ['pg19-btn1', 'VALENCIA ORANGE KG\n(GREENISH)', 'p-open-pg19-btn1'],
  ['pg19-btn4', 'CARA CARA ORANGE KG\n(SMALL HOLE)', 'p-open-pg19-btn4'],
  ['pg19-btn5', '3KG ORANGE\nBAG EA', 'p-open-pg19-btn5'],
  ['pg21-btn0', 'PACKHAM\nPEAR KG', 'p-kb-pg21-packham'],
  ['pg21-btn1', 'NASHI\nPEAR EA', 'p-kb-pg21-nashi'],
  ['pg21-btn3', 'WILLIAMS KG\n(GREEN & ROUNDED)', 'p-open-pg21-btn3']
]

const EXTRA_BUTTONS = [
  {
    id: 'pg26-capsicum-special',
    label: 'CAPSICUM\nSPECIAL KG',
    productId: '54a502c2-f93d-4696-b772-397fa640cef6',
    page: 26,
    gridRow: 4,
    gridCol: 0,
    colSpan: 3,
    rowSpan: 2,
    sortOrder: 26,
    bg: '#7f1d1d'
  }
]

const DEALS = [
  ['deal-carrot-bags-2for5', 'Carrot Bags 2 for $5', 2, 5, ['0b323105-7584-48af-ae1d-85cc67d1b5d1', 'p-kb-pg4-carrot-bag', 'p-open-pg4-carrot-bag']],
  ['deal-fennel-2for4', 'Fennel 2 for $4', 2, 4, ['p-kb-pg4-fennel', 'p-open-pg4-fennel']],
  ['deal-corn-2for2', 'Sweet Corn 3 for $2', 3, 2, ['p-kb-pg4-corn', 'p-open-pg4-corn']],
  ['deal-avocado-2for5', 'Hass Avocado 2 for $5', 2, 5, ['p-open-pg9-btn0']],
  ['deal-limes-3for5', 'Limes 3 for $5', 3, 5, ['p-kb-pg14-limes-ea', 'p-kb-pg14-btn0', 'p-open-pg14-btn0']],
  ['deal-kiwi-gold-2for5', 'Gold Kiwi Fruit 2 for $5', 2, 5, ['p-kb-pg12-btn1', 'p-kb-pg12-gold-kiwi', 'p-open-pg12-btn1']],
  ['deal-cauliflower-2for2', 'Cauliflower 2 for $2', 2, 2, ['p-kb-pg4-cauliflower', 'p-open-pg4-cauliflower']],
  ['deal-petite-tomatoes-2for2', 'Petite Tomatoes 2 for $2', 2, 2, ['4352483e-e5f4-45f4-a9c9-3b2ec6fd522d', 'p-shop-petite-tomatoes']],
  ['deal-wombok-2for2', 'Wombok 2 for $2', 2, 2, ['p-kb-pg25-wombok', 'p-open-pg4-cabbage']]
]

function firstValue (db, sql, params = []) {
  const result = db.exec(sql, params)[0]
  return result?.values?.[0]?.[0]
}

function allRows (db, sql, params = []) {
  return db.exec(sql, params)[0]?.values || []
}

function codeIfAvailable (db, code, productId, column) {
  if (code == null || String(code).trim() === '') return null
  const found = firstValue(db, `SELECT id FROM products WHERE ${column} = ?1 AND id != ?2 LIMIT 1`, [String(code), productId])
  return found ? null : String(code)
}

function upsertProduct (db, row) {
  const [id, name, categoryId, price, unit, plu, barcodeOverride] = row
  const finalPlu = codeIfAvailable(db, plu, id, 'plu')
  const barcode = barcodeOverride === undefined ? plu : barcodeOverride
  const finalBarcode = codeIfAvailable(db, barcode, id, 'barcode')
  db.run(`INSERT INTO products
      (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, open_price, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, 0, 0, 0, 1, 0, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      barcode = COALESCE(excluded.barcode, products.barcode),
      plu = COALESCE(excluded.plu, products.plu),
      name = excluded.name,
      category_id = excluded.category_id,
      price = excluded.price,
      unit = excluded.unit,
      active = 1,
      open_price = 0,
      updated_at = datetime('now')`,
    [id, finalBarcode, finalPlu, name, categoryId, price, unit])
}

function updateExactName (db, name, price, unit) {
  db.run(`UPDATE products
    SET price = ?1, unit = ?2, open_price = 0, active = 1, updated_at = datetime('now')
    WHERE lower(name) = lower(?3)`,
  [price, unit, name])
}

function productPlu (db, productId) {
  return firstValue(db, "SELECT COALESCE(NULLIF(plu, ''), NULLIF(barcode, '')) FROM products WHERE id = ?1", [productId])
}

function linkButton (db, buttonId, label, productId) {
  const plu = productPlu(db, productId)
  db.run(`UPDATE keyboard_buttons
    SET label = ?1,
        product_id = ?2,
        type = 'product',
        price = 0,
        category_filter = COALESCE(?3, category_filter),
        active = 1,
        updated_at = datetime('now')
    WHERE id = ?4`,
  [label, productId, plu, buttonId])
}

function ensureExtraButtons (db) {
  for (const b of EXTRA_BUTTONS) {
    const plu = productPlu(db, b.productId)
    db.run(`INSERT INTO keyboard_buttons
        (id, label, type, price, image, color, bg_color, parent_id, category_filter, alpha_range,
         sort_order, position, page, grid_row, grid_col, col_span, row_span, active, product_id, updated_at)
      VALUES (?1, ?2, 'product', 0, NULL, '#fff', ?3, NULL, ?4, NULL,
        ?5, 'grid', ?6, ?7, ?8, ?9, ?10, 1, ?11, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        type = 'product',
        price = 0,
        bg_color = excluded.bg_color,
        category_filter = excluded.category_filter,
        sort_order = excluded.sort_order,
        position = 'grid',
        page = excluded.page,
        grid_row = excluded.grid_row,
        grid_col = excluded.grid_col,
        col_span = excluded.col_span,
        row_span = excluded.row_span,
        active = 1,
        product_id = excluded.product_id,
        updated_at = datetime('now')`,
    [b.id, b.label, b.bg, plu, b.sortOrder, b.page, b.gridRow, b.gridCol, b.colSpan, b.rowSpan, b.productId])
  }
}

function upsertDeals (db) {
  for (const [id, name, qty, price, productIds] of DEALS) {
    db.run(`INSERT INTO deals (id, name, type, config, active, updated_at)
      VALUES (?1, ?2, 'multi_buy', ?3, 1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        config = excluded.config,
        active = 1,
        updated_at = datetime('now')`,
    [id, name, JSON.stringify({ qty, price })])
    db.run("DELETE FROM deal_products WHERE deal_id = ?1", [id])
    for (const productId of productIds) {
      if (firstValue(db, 'SELECT id FROM products WHERE id = ?1', [productId])) {
        db.run("INSERT OR IGNORE INTO deal_products (deal_id, product_id, role) VALUES (?1, ?2, 'trigger')", [id, productId])
      }
    }
  }
  db.run("UPDATE deals SET active = 0, updated_at = datetime('now') WHERE id IN ('deal-blackberries-2for5', 'deal-twincos-2for1')")
}

function applyToSqlJsDb (db) {
  for (const [id, name, sortOrder, colour, family = ''] of CATEGORIES) {
    db.run(`INSERT INTO categories (id, name, sort_order, colour, family, active, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        sort_order = excluded.sort_order,
        colour = excluded.colour,
        family = excluded.family,
        active = 1,
        updated_at = datetime('now')`,
    [id, name, sortOrder, colour, family])
  }

  for (const product of PRODUCTS) upsertProduct(db, product)
  for (const [name, price, unit] of EXACT_NAME_UPDATES) updateExactName(db, name, price, unit)
  for (const [buttonId, label, productId] of BUTTON_LINKS) linkButton(db, buttonId, label, productId)
  ensureExtraButtons(db)
  upsertDeals(db)

  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, '1')", [migrationKey])
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('keyboard_user_customized', '1')")
  return { products: PRODUCTS.length, buttons: BUTTON_LINKS.length + EXTRA_BUTTONS.length, deals: DEALS.length }
}

function auditSqlJsDb (db) {
  const issues = []
  const priceMatches = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001

  for (const [id, name, , price, unit] of PRODUCTS) {
    const row = allRows(db, 'SELECT name, price, unit, open_price, active FROM products WHERE id = ?1', [id])[0]
    if (!row) {
      issues.push(`missing product ${id} ${name}`)
      continue
    }
    if (row[0] !== name || !priceMatches(row[1], price) || row[2] !== unit || Number(row[3]) !== 0 || Number(row[4]) !== 1) {
      issues.push(`bad product ${id}: got ${row.join(' | ')} expected ${name} | ${price} | ${unit} | 0 | 1`)
    }
  }

  for (const [buttonId, , productId] of BUTTON_LINKS) {
    const row = allRows(db, `SELECT kb.product_id, kb.type, kb.price, p.price, p.unit, p.open_price
      FROM keyboard_buttons kb LEFT JOIN products p ON p.id = kb.product_id
      WHERE kb.id = ?1`, [buttonId])[0]
    if (!row) {
      issues.push(`missing button ${buttonId}`)
      continue
    }
    if (row[0] !== productId || row[1] !== 'product' || Number(row[2]) !== 0 || Number(row[5]) !== 0) {
      issues.push(`bad button ${buttonId}: got ${row.join(' | ')} expected product ${productId}`)
    }
  }

  const integrity = firstValue(db, 'PRAGMA integrity_check')
  if (integrity !== 'ok') issues.push(`sqlite integrity: ${integrity}`)
  return issues
}

async function applyFile (file) {
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(file))
  const result = applyToSqlJsDb(db)
  const issues = auditSqlJsDb(db)
  if (issues.length) {
    db.close()
    throw new Error(`Audit failed for ${file}\n${issues.join('\n')}`)
  }
  fs.writeFileSync(file, Buffer.from(db.export()))
  db.close()
  return result
}

async function auditFile (file) {
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(file))
  const issues = auditSqlJsDb(db)
  db.close()
  return issues
}

async function runStandalone () {
  const args = process.argv.slice(2)
  const auditOnly = args.includes('--audit')
  const files = args.filter(arg => arg !== '--audit')
  const targets = files.length ? files : [bundledDbPath]
  for (const target of targets) {
    if (!fs.existsSync(target)) throw new Error(`DB not found: ${target}`)
    if (auditOnly) {
      const issues = await auditFile(target)
      if (issues.length) {
        console.error(`${target}: ${issues.length} issue(s)`)
        for (const issue of issues) console.error(`- ${issue}`)
        process.exitCode = 1
      } else {
        console.log(`${target}: audit ok`)
      }
    } else {
      const result = await applyFile(target)
      console.log(`${target}: applied ${result.products} products, ${result.buttons} buttons, ${result.deals} deals`)
    }
  }
}

if (require.main === module) {
  runStandalone().catch(err => {
    console.error(err.message || err)
    process.exit(1)
  })
}

module.exports = {
  CATEGORIES,
  PRODUCTS,
  BUTTON_LINKS,
  DEALS,
  migrationKey,
  runtimeDbPath,
  bundledDbPath,
  applyToSqlJsDb,
  auditSqlJsDb,
  applyFile,
  auditFile
}
