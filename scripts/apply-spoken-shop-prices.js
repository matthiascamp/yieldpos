const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const root = path.resolve(__dirname, '..')
const dbPath = path.join(root, 'db', 'crisp-pos.sqlite')
const productsJsonPath = path.join(root, 'products.json')

const CATEGORIES = [
  ['cat-berries', 'Berries', 130, '#8b2252'],
  ['cat-bucket-specials', 'Bucket Specials', 140, '#d97706'],
  ['cat-tropical', 'Tropical', 131, '#e87830'],
  ['cat-capsicum', 'Capsicum', 35, '#ef4444'],
  ['cat-apples', 'Apples', 50, '#dc2626'],
  ['cat-oranges', 'Oranges', 55, '#f97316'],
  ['cat-bananas', 'Bananas', 57, '#eab308'],
  ['cat-melons', 'Melons', 60, '#16a34a'],
  ['cat-potatoes', 'Potatoes', 75, '#a16207'],
  ['cat-onions', 'Onions', 76, '#7c2d12'],
  ['cat-cabbage', 'Cabbage', 77, '#16a34a'],
  ['cat-lettuces', 'Lettuces', 78, '#22c55e'],
  ['cat-pumpkins', 'Pumpkins', 79, '#f97316'],
  ['cat-sweet-potatoes', 'Sweet Potatoes', 80, '#ea580c'],
  ['cat-garlic', 'Garlic', 81, '#d6d3d1'],
  ['cat-mushrooms', 'Mushrooms', 82, '#78716c'],
  ['cat-broccoli', 'Broccoli', 83, '#15803d'],
  ['cat-zucchini', 'Zucchini', 84, '#166534'],
  ['cat-tomatoes', 'Tomatoes', 85, '#dc2626']
]

const PRODUCTS = [
  // Vegetables and greens
  ['p-kb-pg5-herbs', 'Herbs', 'cat-veg', 3.89, 'each', '20101'],
  ['p-kb-pg4-asian-vege', 'Asian Vege', 'cat-veg', 2.99, 'each', '20102'],
  ['p-kb-pg5-shallots', 'Shallots', 'cat-veg', 1.99, 'each', '20103'],
  ['p-kb-pg5-leeks', 'Leeks', 'cat-veg', 3.49, 'each', '20104'],
  ['p-kb-pg5-silverbeet', 'Silverbeet', 'cat-veg', 3.99, 'each', '20105'],
  ['p-kb-pg4-celery', 'Whole Celery', 'cat-veg', 2.99, 'each', '20106'],
  ['p-shop-half-celery', 'Half Celery', 'cat-veg', 1.99, 'each', '20107'],
  ['p-kb-pg25-green-cab', 'Green Cabbage', 'cat-cabbage', 3.99, 'each', '20108'],
  ['p-kb-pg25-red-cab', 'Red Cabbage', 'cat-cabbage', 3.99, 'each', '20109'],
  ['p-shop-half-red-cabbage', 'Half Red Cabbage', 'cat-cabbage', 1.99, 'each', '20110'],
  ['p-open-pg4-cabbage', 'Wombok', 'cat-cabbage', 1.99, 'each', '20111'],
  ['0b103e84-ed33-4f38-a207-011483113059', 'Sugarloaf Cabbage', 'cat-cabbage', 2.99, 'each', '20112'],
  ['p-kb-pg4-cauliflower', 'Cauliflower', 'cat-veg', 1.99, 'each', '20113'],
  ['p-kb-pg5-kale', 'Kale', 'cat-veg', 3.99, 'each', '20114'],
  ['p-open-pg29-btn0', 'Iceberg Lettuce', 'cat-lettuces', 1.99, 'each', '20115'],
  ['p-kb-pg29-btn0', 'Iceberg Lettuce', 'cat-lettuces', 1.99, 'each', '20115'],
  ['262c2a44-c9d9-4019-a754-4aebf992a451', 'Cos Lettuce', 'cat-lettuces', 4.99, 'each', '20116'],
  ['p-kb-pg29-btn1', 'Cos Lettuce', 'cat-lettuces', 4.99, 'each', '20116'],
  ['daf02aa0-9015-4887-95f4-5401a7599724', 'Fancy Lettuce', 'cat-lettuces', 3.99, 'each', '20117'],
  ['p-kb-pg29-btn2', 'Fancy Lettuce', 'cat-lettuces', 3.99, 'each', '20117'],
  ['2b0bddfc-0bbe-4534-8fe2-28ca807ccf77', 'Twin Cos Bag', 'cat-lettuces', 0.79, 'each', '20118'],
  ['p-kb-pg5-lettuce-bags', 'Lettuce Bags', 'cat-lettuces', 3.99, 'each', '20119'],
  ['p-kb-pg4-carrot-bag', 'Carrot Bag', 'cat-veg', 2.69, 'each', '20120'],
  ['p-open-pg4-carrots', 'Carrots Loose', 'cat-veg', 3.69, 'kg', '20121'],
  ['18f58870-b825-4a16-afa2-260b8f680539', 'Snacking Carrots', 'cat-veg', 3.99, 'each', '20122'],
  ['p-kb-pg4-beans', 'Beans', 'cat-veg', 12.99, 'kg', '20123'],
  ['p-capsicum-r', 'Red Capsicum', 'cat-capsicum', 5.99, 'kg', '20124'],
  ['p-kb-pg26-yellow-cap', 'Yellow Capsicum', 'cat-capsicum', 8.99, 'kg', '20125'],
  ['p-kb-pg26-green-cap', 'Green Capsicum', 'cat-capsicum', 7.99, 'kg', '20126'],
  ['p-open-pg36-btn1', 'Zucchini', 'cat-zucchini', 6.99, 'kg', '20127'],
  ['p-kb-pg36-btn0', 'Zucchini', 'cat-zucchini', 6.99, 'kg', '20153'],
  ['p-kb-pg36-btn1', 'Zucchini Bucket', 'cat-bucket-specials', 1.99, 'kg', '20128'],
  ['p-kb-pg30-swiss-brown', 'Swiss Brown Mushroom', 'cat-mushrooms', 16.90, 'kg', '20129'],
  ['p-kb-pg30-flat-mush', 'Flat Mushroom', 'cat-mushrooms', 14.90, 'kg', '20130'],
  ['p-open-pg30-btn0', 'Button Mushrooms', 'cat-mushrooms', 14.90, 'kg', '20131'],
  ['p-kb-pg4-cucumbers', 'Continental Cucumber', 'cat-veg', 1.99, 'each', '20132'],
  ['69be04c8-fa53-4382-8f2d-e72078a19df5', 'Baby Cucumbers', 'cat-veg', 3.99, 'each', '20133'],
  ['d1fdeb3e-1b02-4f31-897a-44b1d2d007a5', 'Lebanese Cucumber', 'cat-veg', 5.89, 'kg', '20134'],
  ['5efb2d20-f303-440d-86bf-641d66fb0b45', 'Leb Cucumber Bucket', 'cat-bucket-specials', 2.89, 'kg', '20135'],
  ['p-kb-pg4-fennel', 'Fennel', 'cat-veg', 2.69, 'each', '20136'],
  ['p-kb-pg4-corn', 'Corn', 'cat-veg', 1.49, 'each', '20137'],
  ['p-kb-pg4-eggplant', 'Eggplant', 'cat-veg', 5.99, 'kg', '20138'],
  ['p-open-pg4-leb-eggplant', 'Leb Eggplant', 'cat-veg', 9.99, 'kg', '20139'],
  ['p-open-pg5-snow-peas', 'Snow Peas', 'cat-veg', 24.99, 'kg', '20140'],
  ['p-open-pg5-sugar-snap', 'Sugar Snap Peas', 'cat-veg', 24.99, 'kg', '20141'],
  ['p-kb-pg4-asparagus', 'Asparagus', 'cat-veg', 4.99, 'each', '20142'],
  ['p-kb-pg27-red-chilli', 'Red Chilli', 'cat-veg', 12.90, 'kg', '20143'],
  ['p-kb-pg4-brussels', 'Brussel Sprouts', 'cat-veg', 12.99, 'kg', '20144'],
  ['dfa6a675-e1e9-4e5e-b281-6cf7d0bd2d2d', 'Broccolini', 'cat-broccoli', 3.99, 'each', '20145'],
  ['p-shop-thai-eggplant', 'Thai Eggplant', 'cat-veg', 9.89, 'kg', '20146'],
  ['p-shop-bitter-gourd', 'Bitter Gourd', 'cat-veg', 5.99, 'kg', '20147'],
  ['p-kb-pg4-chokos', 'Chokos', 'cat-veg', 6.99, 'kg', '20148'],
  ['p-kb-pg5-parsnip', 'Parsnip', 'cat-veg', 12.99, 'kg', '20149'],
  ['p-kb-pg4-ginger', 'Ginger', 'cat-veg', 34.99, 'kg', '20150'],
  ['p-kb-pg5-swedes', 'Swedes', 'cat-veg', 5.89, 'kg', '20151'],
  ['p-kb-pg5-turnip', 'Turnip', 'cat-veg', 5.89, 'kg', '20152'],

  // Potatoes, onions, garlic, pumpkins
  ['p-kb-pg32-potato-bag', 'Potato Bag 3kg', 'cat-potatoes', 5.99, 'each', '20201'],
  ['p-kb-pg31-onion-bag', 'Brown Onion Bag 2kg', 'cat-onions', 3.99, 'each', '20202'],
  ['p-open-pg31-btn0', 'Brown Onion Bag 2kg', 'cat-onions', 3.99, 'each', '20203'],
  ['p-kb-pg31-btn0', 'Brown Onion Bag 2kg', 'cat-onions', 3.99, 'each', '20203'],
  ['p-open-pg31-btn1', 'Brown Onion', 'cat-onions', 2.99, 'kg', '20204'],
  ['p-onion-brown', 'Red Onion', 'cat-onions', 2.99, 'kg', '20205'],
  ['ae18e675-c545-4e3e-a6da-9b2f06165ff3', 'White Onion', 'cat-onions', 7.99, 'kg', '20206'],
  ['p-open-pg31-btn5', 'Premium Red Salad Onion', 'cat-onions', 4.99, 'kg', '20207'],
  ['p-open-pg31-btn6', 'Pickling Onion Bag', 'cat-onions', 3.49, 'each', '20208'],
  ['1bcb5668-b0f2-42e4-a787-aa35f7c55c65', 'Red Onion Bag', 'cat-onions', 2.99, 'each', '20209'],
  ['d600ef51-7cd8-4fa0-8cfe-b68289be453f', 'Red Onion 10kg', 'cat-onions', 18.00, 'each', '20210'],
  ['618f8ec6-d5d8-4627-b00d-e68ac5f8dc41', 'Brown Onion 10kg', 'cat-onions', 12.90, 'each', '20211'],
  ['p-kb-pg28-garlic-kg', 'Garlic', 'cat-garlic', 29.89, 'kg', '20212'],
  ['497dd7e9-cfbc-46bb-abc3-f4c75b6a9f82', 'Garlic Bag', 'cat-garlic', 5.99, 'each', '20213'],
  ['p-kb-pg32-brushed', 'Brushed Potatoes', 'cat-potatoes', 2.99, 'kg', '20214'],
  ['fa57a10a-fd3d-4701-a4fd-422d06bbd44b', 'Washed Potatoes', 'cat-potatoes', 5.59, 'kg', '20215'],
  ['p-kb-pg32-btn1', 'Washed Potatoes White', 'cat-potatoes', 5.59, 'kg', '20216'],
  ['p-kb-pg32-btn4', 'Washed Potatoes Red', 'cat-potatoes', 5.59, 'kg', '20217'],
  ['p-kb-pg32-btn5', 'Dutch Cream Potatoes', 'cat-potatoes', 7.99, 'kg', '20218'],
  ['ed3eab13-99de-4211-93b6-335c3a51b8fe', 'White Chat Potatoes 1kg Bag', 'cat-potatoes', 4.89, 'each', '20219'],
  ['ac97d883-248b-4900-934e-40a3161e32dc', 'Red Chat Potatoes 1kg Bag', 'cat-potatoes', 4.89, 'each', '20220'],
  ['c3e76a3f-95ca-47df-a222-95306b139206', 'White Washed Potatoes 1.5kg Bag', 'cat-potatoes', 2.89, 'each', '20221'],
  ['p-kb-pg34-btn0', 'Gold Sweet Potato', 'cat-sweet-potatoes', 3.99, 'kg', '20222'],
  ['p-open-pg34-btn0', 'Gold Sweet Potato', 'cat-sweet-potatoes', 3.99, 'kg', '20222'],
  ['p-open-pg34-btn1', 'Red Sweet Potato', 'cat-sweet-potatoes', 6.99, 'kg', '20223'],
  ['fa904f6b-8748-41b1-8e85-1acb6c73790f', 'White Sweet Potato', 'cat-sweet-potatoes', 6.99, 'kg', '20224'],
  ['p-shop-outside-sweet-potato', 'Outside Sweet Potato', 'cat-bucket-specials', 1.49, 'kg', '20225'],
  ['p-kb-pg33-jap', 'Jap Pumpkin', 'cat-pumpkins', 2.49, 'kg', '20226'],
  ['068efc9a-e20c-4979-b0e6-15bd79c4070f', 'Jap Pumpkin Cut', 'cat-pumpkins', 2.69, 'kg', '20227'],
  ['p-open-pg33-btn7', 'Jap Pumpkin Outside', 'cat-bucket-specials', 1.99, 'kg', '20228'],
  ['p-kb-pg33-butternut', 'Butternut Pumpkin', 'cat-pumpkins', 2.49, 'kg', '20229'],
  ['31f00381-ed48-4b8b-9789-4d9118b0c5e1', 'Butternut Pumpkin Cut', 'cat-pumpkins', 2.99, 'kg', '20230'],
  ['p-open-pg33-btn6', 'Butternut Pumpkin Outside', 'cat-bucket-specials', 1.49, 'kg', '20231'],
  ['p-open-pg33-btn2', 'Jarra Pumpkin', 'cat-pumpkins', 2.49, 'kg', '20232'],
  ['p-open-pg33-btn5', 'Jarra Pumpkin Cut', 'cat-pumpkins', 2.99, 'kg', '20233'],

  // Fruit
  ['p-kb-pg7-btn6', 'Large Pink Lady Apple', 'cat-apples', 8.99, 'kg', '20301'],
  ['p-kb-pg7-btn1', 'Small Pink Lady Apple', 'cat-apples', 4.99, 'kg', '20302'],
  ['p-kb-pg7-btn8', 'Large Royal Gala Apple', 'cat-apples', 6.89, 'kg', '20303'],
  ['p-kb-pg7-btn3', 'Small Royal Gala Apple', 'cat-apples', 4.99, 'kg', '20304'],
  ['ae73525e-3d9f-4992-bfc9-1c0e9f299d4f', 'Large Granny Smith Apple', 'cat-apples', 5.99, 'kg', '20305'],
  ['p-kb-pg7-btn2', 'Small Granny Smith Apple', 'cat-apples', 5.99, 'kg', '20306'],
  ['p-kb-pg7-btn10', 'Granny Smith Bucket', 'cat-bucket-specials', 1.99, 'kg', '20307'],
  ['2b95e9d9-c52b-498a-9345-3e5aa7c89435', 'Kanzi Apple', 'cat-apples', 7.99, 'kg', '20308'],
  ['p-kb-pg7-btn4', 'Large Jazz Apple', 'cat-apples', 6.89, 'kg', '20309'],
  ['p-kb-pg7-red-delicious', 'Red Delicious Apple', 'cat-apples', 5.89, 'kg', '20310'],
  ['p-kb-pg7-btn5', 'Red Apple Bucket', 'cat-bucket-specials', 1.99, 'kg', '20311'],
  ['p-kb-pg7-btn0', 'Bravo Apple', 'cat-apples', 6.49, 'kg', '20312'],
  ['p-shop-sassy-apple', 'Sassy Apple', 'cat-apples', 6.49, 'kg', '20313'],
  ['p-shop-missile-apple', 'Missile Apple', 'cat-apples', 4.99, 'kg', '20314'],
  ['p-kb-pg21-packham', 'Packham Pear', 'cat-fruit', 5.89, 'kg', '20315'],
  ['p-open-pg21-btn3', 'Williams Pear', 'cat-fruit', 5.89, 'kg', '20316'],
  ['p-kb-pg21-nashi', 'Nashi Pear', 'cat-fruit', 1.99, 'each', '20317'],
  ['p-orange-navel', 'Navel Orange', 'cat-oranges', 6.99, 'kg', '20318'],
  ['p-open-pg19-btn4', 'Cara Cara Orange', 'cat-oranges', 5.89, 'kg', '20319'],
  ['p-open-pg19-btn1', 'Valencia Orange', 'cat-oranges', 3.89, 'kg', '20320'],
  ['p-open-pg19-btn5', 'Orange Bag 3kg', 'cat-oranges', 6.99, 'each', '20321'],
  ['p-kb-pg15-imperial', 'Imperial Mandarin', 'cat-fruit', 4.89, 'kg', '20322'],
  ['p-kb-pg15-afourer', 'Afourer Mandarin', 'cat-fruit', 4.99, 'kg', '20323'],
  ['p-kb-pg15-btn2', 'Imperial Mandarin Bucket', 'cat-bucket-specials', 1.99, 'kg', '20324'],
  ['p-kb-pg13-lemons-kg', 'Lemons', 'cat-fruit', 5.99, 'kg', '20325'],
  ['p-open-pg13-btn1', 'Aussie Lemon Bag', 'cat-fruit', 1.99, 'each', '20326'],
  ['p-shop-lemon-bucket', 'Juicy Lemon Bucket', 'cat-bucket-specials', 1.99, 'kg', '20327'],
  ['p-kb-pg14-limes-ea', 'Limes', 'cat-fruit', 1.99, 'each', '20328'],
  ['p-open-pg14-btn1', 'Bagged Limes', 'cat-fruit', 2.99, 'kg', '20329'],
  ['p-shop-limes-bucket', 'Limes Bucket', 'cat-bucket-specials', 2.99, 'kg', '20330'],
  ['p-kb-pg2-grapefruit', 'Red Grapefruit', 'cat-fruit', 3.99, 'kg', '20331'],
  ['p-kb-pg2-custard-apple', 'Custard Apple', 'cat-fruit', 12.99, 'kg', '20332'],
  ['p-kb-pg3-persimmons', 'Persimmons', 'cat-fruit', 12.99, 'kg', '20333'],
  ['p-kb-pg3-pomegranate', 'Pomegranate', 'cat-fruit', 4.89, 'each', '20334'],
  ['p-kb-pg3-passion-fruit', 'Passion Fruit', 'cat-fruit', 1.99, 'each', '20335'],
  ['p-open-pg12-btn0', 'Regular Kiwi', 'cat-fruit', 14.89, 'kg', '20336'],
  ['p-kb-pg12-gold-kiwi', 'Gold Kiwi', 'cat-fruit', 2.89, 'each', '20337'],
  ['p-open-pg9-btn0', 'Hass Avocado', 'cat-fruit', 2.99, 'each', '20338'],
  ['p-avocado', 'Shepard Avocado', 'cat-fruit', 2.99, 'each', '20339'],
  ['ad3d72a1-947b-4b96-b651-fb6c0db98e35', 'Avocado Bag', 'cat-fruit', 1.49, 'kg', '20340'],
  ['9f6a5df7-9e75-4a21-9747-c2b61e6dc347', 'Cavendish Banana', 'cat-bananas', 4.99, 'kg', '20341'],
  ['p-kb-pg10-lady-finger', 'Lady Finger Banana', 'cat-bananas', 6.99, 'kg', '20342'],
  ['p-kb-pg10-btn2', 'Cavendish Banana Bucket', 'cat-bucket-specials', 1.99, 'kg', '20343'],
  ['p-kb-pg10-btn3', 'Lady Finger Banana Bucket', 'cat-bucket-specials', 1.99, 'kg', '20344'],
  ['p-kb-pg3-pineapple-xl', 'Extra Large Pineapple', 'cat-tropical', 7.99, 'each', '20345'],
  ['p-kb-pg3-pineapple-sm', 'Sweet Pineapple', 'cat-tropical', 3.99, 'each', '20346'],
  ['p-kb-pg3-pineapple-md', 'Pineapple', 'cat-tropical', 3.99, 'each', '20347'],
  ['p-kb-pg17-rockmelon', 'Rockmelon', 'cat-melons', 5.99, 'each', '20348'],
  ['p-kb-pg17-honeydew', 'Honeydew', 'cat-melons', 5.89, 'each', '20349'],
  ['p-open-pg17-btn2', 'Round Seedless Watermelon', 'cat-melons', 0.99, 'kg', '20368'],
  ['p-open-pg17-btn3', 'Outside Rockmelon', 'cat-melons', 5.99, 'each', '20369'],
  ['p-open-pg17-btn4', 'Outside Honeydew', 'cat-melons', 5.89, 'each', '20370'],
  ['p-open-pg17-btn5', 'Santa Claus Melon', 'cat-melons', 5.89, 'each', '20371'],
  ['p-kb-pg3-papaya', 'Red Papaya', 'cat-tropical', 5.99, 'kg', '20350'],
  ['p-shop-red-pawpaw-cut', 'Red Paw Paw Cut', 'cat-tropical', 6.49, 'kg', '20351'],
  ['p-kb-pg2-coconut', 'Drinking Coconut', 'cat-tropical', 4.49, 'each', '20352'],
  ['p-kb-pg2-dragon-fruit', 'Dragon Fruit', 'cat-tropical', 15.99, 'kg', '20353'],
  ['ac03332b-0d6d-4a12-a511-ec1695aaea57', 'Whole Seedless Watermelon', 'cat-melons', 0.99, 'kg', '20354'],
  ['p-watermelon', 'Long Seeded Watermelon', 'cat-melons', 0.99, 'kg', '20355'],
  ['d1f6edd4-21f8-40b3-9f10-bc45156e53d1', 'Watermelon Cut', 'cat-melons', 1.49, 'kg', '20356'],
  ['e55af428-537a-4de2-baae-913b80aa5b19', 'Blueberries', 'cat-berries', 8.99, 'each', '20357'],
  ['0edc2cf3-25af-474c-8246-7e5aa074f7e7', 'Blackberries', 'cat-berries', 2.99, 'each', '20358'],
  ['p-strawberry', 'Premium Strawberries', 'cat-berries', 5.99, 'each', '20359'],
  ['cee1f1ec-4baf-4cf9-96d5-1cde32ffb6bb', 'Farm Strawberries', 'cat-berries', 5.89, 'each', '20360'],
  ['34cd1e15-88cf-4335-8f0f-1ce1b9ca4ec2', 'Raspberries', 'cat-berries', 5.99, 'each', '20361'],
  ['p-open-pg11-btn0', 'White Seedless Grapes', 'cat-fruit', 7.89, 'kg', '20362'],
  ['p-open-pg11-btn1', 'Red Seedless Grapes', 'cat-fruit', 5.99, 'kg', '20363'],
  ['p-open-pg11-btn2', 'Black Seedless Grapes', 'cat-fruit', 5.99, 'kg', '20364'],
  ['p-open-pg11-btn3', 'Autumn King Grapes', 'cat-fruit', 5.99, 'kg', '20365'],
  ['p-open-pg11-btn4', 'Black Muscat Grapes', 'cat-fruit', 5.99, 'kg', '20366'],
  ['p-shop-sweet-persimmon-bag', 'Sweet Persimmon Bag', 'cat-fruit', 5.99, 'kg', '20367'],
  ['p-kb-pg16-r2e2', 'R2E2 Mango', 'cat-tropical', 5.99, 'each', '20372'],
  ['p-kb-pg16-btn0', 'Small KP Mango', 'cat-tropical', 1.99, 'each', '20389'],
  ['p-kb-pg16-btn3', 'Medium KP Mango', 'cat-tropical', 2.99, 'each', '20390'],
  ['p-kb-pg16-calypso', 'Calypso Mango', 'cat-tropical', 3.49, 'each', '20373'],
  ['p-kb-pg16-btn4', 'Keitt Mango', 'cat-tropical', 1.99, 'each', '20374'],
  ['p-kb-pg16-btn5', 'Calypso Mango', 'cat-tropical', 3.49, 'each', '20375'],
  ['p-kb-pg16-btn2', 'Pearl Mango', 'cat-tropical', 3.49, 'each', '20376'],
  ['p-kb-pg16-btn6', 'Large KP Mango', 'cat-tropical', 3.99, 'each', '20377'],
  ['p-kb-pg18-yellow-nect', 'Yellow Nectarine', 'cat-fruit', 6.99, 'kg', '20378'],
  ['p-kb-pg18-white-nect', 'White Nectarine', 'cat-fruit', 6.99, 'kg', '20379'],
  ['p-kb-pg20-yellow-peach', 'Yellow Peach', 'cat-fruit', 6.99, 'kg', '20380'],
  ['p-kb-pg20-white-peach', 'White Peach', 'cat-fruit', 6.99, 'kg', '20381'],
  ['p-kb-pg20-btn3', 'Donut Peach', 'cat-fruit', 6.99, 'kg', '20382'],
  ['p-kb-pg20-btn4', 'Peach Bucket', 'cat-bucket-specials', 1.99, 'kg', '20383'],
  ['p-kb-pg21-btn2', 'Bosc Pear', 'cat-fruit', 5.89, 'kg', '20384'],
  ['p-kb-pg21-btn4', 'Piqa Boo Pear', 'cat-fruit', 5.99, 'kg', '20385'],
  ['p-kb-pg21-btn5', 'Pear Bucket', 'cat-bucket-specials', 1.99, 'kg', '20386'],
  ['p-kb-pg22-btn3', 'Candy Plum', 'cat-fruit', 16.90, 'kg', '20387'],
  ['p-kb-pg22-btn4', 'Plums In Bucket', 'cat-bucket-specials', 2.99, 'kg', '20388'],
  ['p-open-pg9-btn2', 'Shepard Avocado', 'cat-fruit', 2.99, 'each', '20391'],
  ['p-open-pg17-btn6', 'Long Seeded Watermelon', 'cat-melons', 0.99, 'kg', '20392'],
  ['p-open-pg33-btn8', 'Jarra Pumpkin Outside', 'cat-bucket-specials', 1.99, 'kg', '20393'],
  ['p-open-pg34-btn3', 'Outside Gold Sweet Potato', 'cat-bucket-specials', 1.49, 'kg', '20394'],
  ['p-open-pg34-btn2', 'White Sweet Potato', 'cat-sweet-potatoes', 6.99, 'kg', '20395'],
  ['p-kb-pg35-roma', 'Roma Tomato', 'cat-tomatoes', 7.89, 'kg', '20401'],
  ['e2aaef7b-68c3-4c8c-946d-d2e26606287f', 'Roma Egg Tomato', 'cat-tomatoes', 7.89, 'kg', '20402'],
  ['p-kb-pg35-truss', 'Truss Tomato', 'cat-tomatoes', 7.99, 'kg', '20403'],
  ['p-open-pg35-round-roma-bucket', 'Round Roma Bucket', 'cat-bucket-specials', 1.49, 'kg', '20404'],
  ['p-open-pg35-roma-bucket', 'Roma Tomato Bucket', 'cat-bucket-specials', 1.49, 'kg', '20405'],
  ['f32a2d39-fb12-4b68-8855-00e2dd0ff869', 'Gourmet Tomatoes', 'cat-tomatoes', 6.89, 'kg', '20406']
  ,['p-shop-gas-buy-85', 'Gas Buy 8.5kg', 'cat-gas', 0, 'each', '20407']
  ,['p-shop-gas-swap-4', 'Gas Swap 4kg', 'cat-gas', 25.00, 'each', '20408']
  ,['p-shop-gas-swap-85', 'Gas Swap 8.5kg', 'cat-gas', 30.00, 'each', '20409']
]

const DEALS = [
  ['deal-carrot-bags-2for5', 'Carrot Bags 2 for $5', 2, 5, 'p-kb-pg4-carrot-bag'],
  ['deal-fennel-2for4', 'Fennel 2 for $4', 2, 4, 'p-kb-pg4-fennel'],
  ['deal-corn-2for2', 'Sweet Corn 2 for $2', 2, 2, 'p-kb-pg4-corn'],
  ['deal-avocado-2for5', 'Hass Avocado 2 for $5', 2, 5, 'p-open-pg9-btn0'],
  ['deal-limes-3for5', 'Limes 3 for $5', 3, 5, 'p-kb-pg14-limes-ea'],
  ['deal-kiwi-gold-2for5', 'Gold Kiwi Fruit 2 for $5', 2, 5, 'p-kb-pg12-gold-kiwi'],
  ['deal-blackberries-2for5', 'Blackberries 2 for $5', 2, 5, '0edc2cf3-25af-474c-8246-7e5aa074f7e7'],
  ['deal-twincos-2for1', 'Twin Cos Bags 2 for $1', 2, 1, '2b0bddfc-0bbe-4534-8fe2-28ca807ccf77']
]

const EXACT_PRICE_UPDATES = [
  // Greens / vegetables
  ['FRESH HERBS', 3.89, 'each'], ['HERBS', 3.89, 'each'],
  ['ASIAN VEGE BUNCH', 2.99, 'each'], ['Asian Vege', 2.99, 'each'],
  ['ESHALLOTS BUNCH', 1.99, 'each'], ['Shallots', 1.99, 'each'],
  ['LEEK BUNCH', 3.49, 'each'], ['Leeks', 3.49, 'each'],
  ['SILVERBEET BUNCH', 3.99, 'each'], ['Silverbeet', 3.99, 'each'],
  ['CELERY', 2.99, 'each'], ['Whole Celery', 2.99, 'each'],
  ['CELERY 1/2 BUNCH', 1.99, 'each'], ['Half Celery', 1.99, 'each'],
  ['Wombok', 1.99, 'each'], ['Green Cabbage', 3.99, 'each'], ['Red Cabbage', 3.99, 'each'], ['Half Red Cabbage', 1.99, 'each'],
  ['CARROTS KG', 3.69, 'kg'], ['Carrots Loose', 3.69, 'kg'], ['CARROTS BAG', 2.69, 'each'], ['CARROTS 1 KG BAG', 2.69, 'each'], ['CARROTS BAG 1 KG', 2.69, 'each'], ['Carrot Bag', 2.69, 'each'],
  ['SNACKING BABY CARROTS 250G', 3.99, 'each'], ['Snacking Carrots', 3.99, 'each'],
  ['BEANS FRESH KG', 12.99, 'kg'], ['Beans', 12.99, 'kg'],
  ['CAPSICUM RED KG', 5.99, 'kg'], ['Red Capsicum', 5.99, 'kg'], ['CAPSICUM YELLOW KG', 8.99, 'kg'], ['Yellow Capsicum', 8.99, 'kg'], ['CAPSICUM GREEN KG', 7.99, 'kg'], ['Green Capsicum', 7.99, 'kg'],
  ['Red Capsicum Bag', 2.49, 'kg'], ['Premium Red Capsicum Bag', 2.49, 'kg'],
  ['ZUCCHINI LGE KG', 6.99, 'kg'], ['Green Zucchini', 6.99, 'kg'], ['Zucchini', 6.99, 'kg'],
  ['MUSHROOM SWISS BROWN KG', 16.90, 'kg'], ['Swiss Brown Mushroom', 16.90, 'kg'], ['MUSHROOM FLAT KG', 14.90, 'kg'], ['Flat Mushroom', 14.90, 'kg'], ['MUSHROOM CUPS KG', 14.90, 'kg'], ['Button Mushrooms', 14.90, 'kg'],
  ['BABY CUCUMBERS', 3.99, 'each'], ['Baby Cucumbers', 3.99, 'each'],
  ['ANISEED/FENNEL EACH', 2.69, 'each'], ['Fennel', 2.69, 'each'],
  ['CORN EACH', 1.49, 'each'], ['Corn', 1.49, 'each'],
  ['EGGPLANT KG', 5.99, 'kg'], ['Eggplant', 5.99, 'kg'], ['EGGPLANT BABY KG', 9.99, 'kg'], ['Leb Eggplant', 9.99, 'kg'], ['Lebanese Eggplant', 9.99, 'kg'],
  ['SNOW PEAS KG', 24.99, 'kg'], ['Snow Peas', 24.99, 'kg'],
  ['ASPARAGUS BUNCH', 4.99, 'each'], ['Asparagus', 4.99, 'each'],
  ['Red Chilli', 12.90, 'kg'], ['RED CHILLI KG', 12.90, 'kg'],
  ['BRUSSEL SPROUTS KG', 12.99, 'kg'], ['Brussel Sprouts', 12.99, 'kg'],
  ['BROCCOLINI BUNCH', 3.99, 'each'], ['Broccolini', 3.99, 'each'],
  ['EGGPLANT THAI KG', 9.89, 'kg'], ['Thai Eggplant', 9.89, 'kg'],
  ['Broccoli', 4.59, 'kg'], ['BROCCOLI KG', 4.59, 'kg'],
  ['Bitter Gourd', 5.99, 'kg'], ['Chokos', 6.99, 'kg'], ['PARSNIP KG', 12.99, 'kg'], ['Parsnip', 12.99, 'kg'],
  ['(S) KG FRESH GINGER', 34.99, 'kg'], ['Ginger', 34.99, 'kg'],
  ['SWEDES KG', 5.89, 'kg'], ['Swedes', 5.89, 'kg'], ['TURNIP WHITE KG', 5.89, 'kg'], ['Turnip', 5.89, 'kg'],

  // Potatoes / onions / pumpkins
  ['Potato Bag 3kg', 5.99, 'each'], ['POTATOES BRUSHED 3KG', 5.99, 'each'],
  ['Brown Onion Bag 2kg', 3.99, 'each'], ['Red Onion Bag', 2.99, 'each'], ['ONIONS PICKLING BAG 1KG', 3.49, 'each'], ['Pickling Onion Bag', 3.49, 'each'],
  ['FRESH GARLIC BAGS', 5.99, 'each'], ['GARLIC BAG', 5.99, 'each'], ['Garlic Bag', 5.99, 'each'],
  ['(S) GARLIC AUSTRALIAN KG', 29.89, 'kg'], ['Garlic', 29.89, 'kg'],
  ['ONIONS BROWN KG', 2.99, 'kg'], ['Brown Onion', 2.99, 'kg'], ['ONIONS WHITE KG', 7.99, 'kg'], ['White Onion', 7.99, 'kg'], ['ONIONS SALAD/SPANISH KG', 4.99, 'kg'], ['Premium Red Salad Onion', 4.99, 'kg'], ['Salad Onion', 4.99, 'kg'],
  ['10KG RED ONION', 18.00, 'each'], ['Red Onion 10kg', 18.00, 'each'], ['10KG BROWN ONION', 12.90, 'each'], ['Brown Onion 10kg', 12.90, 'each'],
  ['Brushed', 2.99, 'kg'], ['Brushed Potatoes', 2.99, 'kg'], ['Washed Potatoes', 5.59, 'kg'], ['Dutch Cream Potatoes', 7.99, 'kg'],
  ['White Chat Potatoes 1kg Bag', 4.89, 'each'], ['White Washed Potatoes 1.5kg Bag', 2.89, 'each'],
  ['Sweet Potato', 3.99, 'kg'], ['Gold Sweet Potato', 3.99, 'kg'], ['White Sweet Potato', 6.99, 'kg'], ['Outside Sweet Potato', 1.49, 'kg'],
  ['BEETROOT KG', 4.99, 'kg'], ['Beetroot', 4.99, 'kg'], ['Sugarloaf Cabbage', 2.99, 'each'], ['Cauliflower', 1.99, 'each'], ['Kale', 3.99, 'each'],
  ['Jap Pumpkin', 2.49, 'kg'], ['Jap', 2.49, 'kg'], ['Jap Pumpkin Cut', 2.69, 'kg'], ['Jap Cut', 2.69, 'kg'], ['Jap Pumpkin Outside', 1.99, 'kg'], ['Whole Jap Pumpkin', 1.99, 'kg'],
  ['Butternut Pumpkin', 2.49, 'kg'], ['Butternut', 2.49, 'kg'], ['Butternut Pumpkin Cut', 2.99, 'kg'], ['Butternut Cut', 2.99, 'kg'],
  ['Jarra Pumpkin', 2.49, 'kg'], ['Jarra', 2.49, 'kg'], ['Jarra Pumpkin Cut', 2.99, 'kg'], ['Jarra Cut', 2.99, 'kg'],

  // Fruit
  ['ORANGES NAVEL KG', 6.99, 'kg'], ['Navel Orange', 6.99, 'kg'],
  ['Large Pink Lady Apple', 8.99, 'kg'], ['Pink Lady Apple', 8.99, 'kg'], ['Granny Smith Apples', 5.99, 'kg'], ['Large Granny Smith Apple', 5.99, 'kg'], ['Small Granny Smith Apple', 5.99, 'kg'],
  ['Large Royal Gala Apple', 6.89, 'kg'], ['Red Delicious Apple', 5.89, 'kg'], ['Kanzi Apple', 7.99, 'kg'], ['Sassy Apple', 6.49, 'kg'], ['Missile Apple', 4.99, 'kg'], ['Large Jazz Apple', 6.89, 'kg'], ['Jazz Apple', 6.89, 'kg'], ['Bravo Apple', 6.49, 'kg'],
  ['Packham Pear', 5.89, 'kg'], ['PEARS PACKHAM KG', 5.89, 'kg'], ['Williams Pear', 5.89, 'kg'], ['PEARS WILLIAM KG', 5.89, 'kg'], ['Nashi Pear', 1.99, 'each'],
  ['IMPERIAL MANDARINS KG', 4.89, 'kg'], ['Imperial Mandarin', 4.89, 'kg'], ['Afourer Mandarin', 4.99, 'kg'], ['CARA CARA ORANGE KG', 5.89, 'kg'], ['Cara Cara Orange', 5.89, 'kg'], ['ORANGES VALENCIA KG', 3.89, 'kg'], ['Valencia Orange', 3.89, 'kg'], ['Red Grapefruit', 3.99, 'kg'],
  ['Aussie Lemon Bag', 1.99, 'each'], ['Lemons', 5.99, 'kg'], ['Lemons Bucket', 1.99, 'kg'], ['Limes', 1.99, 'each'], ['Limes Bucket', 2.99, 'kg'], ['Bagged Limes', 2.99, 'kg'],
  ['Hass Avocado', 2.99, 'each'], ['Avocado Bag', 1.49, 'kg'], ['Custard Apple', 12.99, 'kg'], ['Persimmons', 12.99, 'kg'], ['Sweet Persimmon Bag', 5.99, 'kg'], ['Pomegranate', 4.89, 'each'], ['Passion Fruit', 1.99, 'each'],
  ['Regular Kiwi', 14.89, 'kg'], ['KIWI FRUIT KG', 14.89, 'kg'], ['Gold Kiwi', 2.89, 'each'], ['KIWI FRUIT GOLD EACH', 2.89, 'each'],
  ['Lady Finger Banana', 6.99, 'kg'], ['Cavendish Banana', 4.99, 'kg'], ['Cavendish Banana Bucket', 1.99, 'kg'], ['Granny Smith Bucket', 1.99, 'kg'], ['Pink Lady Bucket', 2.89, 'kg'],
  ['Orange Bag 3kg', 6.99, 'each'], ['Round Seedless Watermelon', 0.99, 'kg'], ['Whole Seedless Watermelon', 0.99, 'kg'], ['Watermelon Cut', 1.49, 'kg'], ['SEEDLESS WATERMELON CUT KG', 1.49, 'kg'],
  ['Extra Large Pineapple', 7.99, 'each'], ['Sweet Pineapple', 3.99, 'each'], ['Pineapple', 3.99, 'each'], ['Rockmelon', 5.99, 'each'], ['Honeydew', 5.89, 'each'],
  ['Red Papaya', 5.99, 'kg'], ['Papaya Red', 5.99, 'kg'], ['Red Paw Paw Cut', 6.49, 'kg'], ['Drinking Coconut', 4.49, 'each'], ['Dragon Fruit', 15.99, 'kg'],
  ['Blackberries', 2.99, 'each'], ['Blueberries', 8.99, 'each'], ['Premium Strawberries', 5.99, 'each'], ['Farm Strawberries', 5.89, 'each'], ['Raspberries', 5.99, 'each'],
  ['Green Grapes', 7.89, 'kg'], ['White Seedless Grapes', 7.89, 'kg'], ['Red Seedless Grapes', 5.99, 'kg'], ['Black Seedless Grapes', 5.99, 'kg'], ['GRAPES RED SEEDLESS KG', 5.99, 'kg'], ['GRAPES BLACK SEEDLESS KG', 5.99, 'kg']
]

function upsertProduct (db, product) {
  const [id, name, categoryId, price, unit, plu] = product
  let finalPlu = plu
  if (finalPlu) {
    const conflict = db.exec("SELECT id FROM products WHERE (plu = ?1 OR barcode = ?1) AND id != ?2 LIMIT 1", [finalPlu, id])
    if (conflict.length && conflict[0].values.length) finalPlu = null
  }
  db.run(`INSERT INTO products
    (id, barcode, plu, name, category_id, price, cost_price, unit, tax_rate, track_stock, stock_qty, active, open_price, updated_at)
    VALUES (?1, ?6, ?6, ?2, ?3, ?4, 0, ?5, 0, 0, 0, 1, 0, datetime('now'))
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
    [id, name, categoryId, price, unit, finalPlu])
}

function updateExactName (db, name, price, unit) {
  db.run("UPDATE products SET price = ?1, unit = ?2, open_price = 0, active = 1, updated_at = datetime('now') WHERE lower(name) = lower(?3)", [price, unit, name])
}

function nextAvailablePlu (db, start = 21000) {
  const usedRows = db.exec("SELECT plu FROM products WHERE plu IS NOT NULL AND TRIM(plu) != ''")
  const used = new Set((usedRows[0]?.values || []).map(row => String(row[0])))
  let next = start
  while (used.has(String(next))) next++
  return String(next)
}

function syncKeyboardButtons (db) {
  db.run(`UPDATE keyboard_buttons
    SET type = CASE
        WHEN id IN ('np-clear') THEN 'clear'
        WHEN id IN ('np-qtyx') THEN 'qtyx'
        WHEN id IN ('np-enter') THEN 'codeenter'
        WHEN id IN ('np-display') THEN 'num_display'
        ELSE 'digit'
      END,
      product_id = NULL,
      price = 0,
      updated_at = datetime('now')
    WHERE id LIKE 'np-%'`)

  db.run("UPDATE keyboard_buttons SET price = 0, type = 'product', updated_at = datetime('now') WHERE product_id IN (SELECT id FROM products WHERE open_price = 0 AND active = 1) AND type = 'product'")
  db.run("UPDATE keyboard_buttons SET label = 'RED CAPSICUM KG', product_id = 'p-capsicum-r', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg26-red-capsicum'")
  db.run("UPDATE keyboard_buttons SET label = 'YELLOW CAPSICUM KG', product_id = 'p-kb-pg26-yellow-cap', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg26-yellow-capsicum'")
  db.run("UPDATE keyboard_buttons SET label = 'GREEN CAPSICUM KG', product_id = 'p-kb-pg26-green-cap', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg26-green-capsicum'")
  db.run("UPDATE keyboard_buttons SET label = 'SWISS BROWN\\nMUSHROOM KG', product_id = 'p-kb-pg30-swiss-brown', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg30-btn1'")
  db.run("UPDATE keyboard_buttons SET label = 'TRUSS TOMATO KG', product_id = 'p-kb-pg35-truss', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg35-truss-kg'")
  db.run("UPDATE keyboard_buttons SET label = '2KG BROWN\\nONION BAG', product_id = 'p-open-pg31-btn0', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg31-btn0'")
  db.run("UPDATE keyboard_buttons SET label = 'ONION RED KG', product_id = 'p-open-pg31-btn5', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg31-btn2'")
  db.run("UPDATE keyboard_buttons SET label = 'ONION WHITE KG', product_id = 'ae18e675-c545-4e3e-a6da-9b2f06165ff3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg31-btn3'")
  db.run("UPDATE keyboard_buttons SET label = 'RED ONION BAG', product_id = '1bcb5668-b0f2-42e4-a787-aa35f7c55c65', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg31-btn4'")
  db.run("UPDATE keyboard_buttons SET label = 'BRAVO KG', product_id = 'p-kb-pg7-btn0', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg7-btn0'")
  db.run("UPDATE keyboard_buttons SET label = 'LARGE GRANNY SMITH KG', product_id = 'ae73525e-3d9f-4992-bfc9-1c0e9f299d4f', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg7-btn7'")
  db.run("UPDATE keyboard_buttons SET label = 'JAZZ APPLE KG', product_id = 'p-kb-pg7-btn4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg7-btn4'")
  db.run("UPDATE keyboard_buttons SET label = 'SMALL PINK LADY KG\\n(SPOTTY)', product_id = 'p-kb-pg7-btn1', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg7-btn1'")
  db.run("UPDATE keyboard_buttons SET label = 'SMALL ROYAL GALA KG\\n(STRIPY)', product_id = 'p-kb-pg7-btn3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg7-btn3'")
  db.run("UPDATE keyboard_buttons SET label = 'FUJI APPLE EA', product_id = 'p-kb-pg7-btn12', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg7-btn12'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-r2e2', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn1'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-btn0', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn0'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-calypso', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn5'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-btn3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn3'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-btn4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn4'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-btn2', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn2'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg16-btn6', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg16-btn6'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg17-btn2', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg17-btn2'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg17-btn3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg17-btn3'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg17-btn4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg17-btn4'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg17-btn5', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg17-btn5'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg18-yellow-nect', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg18-btn0'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg18-white-nect', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg18-btn1'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg20-yellow-peach', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg20-btn1'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg20-white-peach', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg20-btn2'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg20-btn3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg20-btn3'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg20-btn4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg20-btn4'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg9-btn2', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg9-btn2'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg17-btn6', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg17-btn6'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg21-btn2', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg21-btn2'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg21-btn4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg21-btn4'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg21-btn5', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg21-btn5'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg22-btn3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg22-btn3'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg22-btn4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg22-btn4'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg33-btn8', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg33-btn8'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg34-btn3', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg34-btn3'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-open-pg34-btn2', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg34-btn2'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-kb-pg36-btn0', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg36-btn0'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-shop-gas-swap-4', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg37-gas-3'")
  db.run("UPDATE keyboard_buttons SET product_id = 'p-shop-gas-swap-85', type = 'product', price = 0, updated_at = datetime('now') WHERE id = 'pg37-gas-4'")

  // Product buttons keep the DB product id as product_id. The visible/editable
  // PLU field is the numeric products.plu copied into category_filter.
  db.run(`UPDATE keyboard_buttons
    SET category_filter = (
        SELECT products.plu FROM products
        WHERE products.id = keyboard_buttons.product_id
          AND products.plu IS NOT NULL
          AND TRIM(products.plu) != ''
      ),
      type = 'product',
      price = 0,
      updated_at = datetime('now')
    WHERE product_id IS NOT NULL
      AND id NOT LIKE 'np-%'
      AND EXISTS (
        SELECT 1 FROM products
        WHERE products.id = keyboard_buttons.product_id
          AND products.plu IS NOT NULL
          AND TRIM(products.plu) != ''
      )`)

  // If a key only has a numeric PLU fallback, reconnect it to the matching DB product.
  db.run(`UPDATE keyboard_buttons
    SET product_id = (
        SELECT products.id FROM products
        WHERE products.active = 1
          AND (products.plu = keyboard_buttons.category_filter OR products.barcode = keyboard_buttons.category_filter)
        LIMIT 1
      ),
      type = 'product',
      price = 0,
      updated_at = datetime('now')
    WHERE product_id IS NULL
      AND id NOT LIKE 'np-%'
      AND category_filter GLOB '[0-9]*'
      AND EXISTS (
        SELECT 1 FROM products
        WHERE products.active = 1
          AND (products.plu = keyboard_buttons.category_filter OR products.barcode = keyboard_buttons.category_filter)
      )`)

  const missingPluRows = db.exec(`SELECT DISTINCT p.id
    FROM keyboard_buttons kb
    JOIN products p ON p.id = kb.product_id
    WHERE kb.active = 1
      AND kb.type = 'product'
      AND kb.id NOT LIKE 'np-%'
      AND (p.plu IS NULL OR TRIM(p.plu) = '')`)
  for (const row of (missingPluRows[0]?.values || [])) {
    const productId = row[0]
    const plu = nextAvailablePlu(db)
    db.run("UPDATE products SET plu = ?1, barcode = ?1, updated_at = datetime('now') WHERE id = ?2", [plu, productId])
  }

  db.run(`UPDATE keyboard_buttons
    SET category_filter = (
        SELECT products.plu FROM products
        WHERE products.id = keyboard_buttons.product_id
          AND products.plu IS NOT NULL
          AND TRIM(products.plu) != ''
      ),
      type = 'product',
      price = 0,
      updated_at = datetime('now')
    WHERE product_id IS NOT NULL
      AND id NOT LIKE 'np-%'
      AND EXISTS (
        SELECT 1 FROM products
        WHERE products.id = keyboard_buttons.product_id
          AND products.plu IS NOT NULL
          AND TRIM(products.plu) != ''
      )`)

  db.run(`UPDATE keyboard_buttons
    SET type = CASE
        WHEN id IN ('np-clear') THEN 'clear'
        WHEN id IN ('np-qtyx') THEN 'qtyx'
        WHEN id IN ('np-enter') THEN 'codeenter'
        WHEN id IN ('np-display') THEN 'num_display'
        ELSE 'digit'
      END,
      product_id = NULL,
      price = 0,
      updated_at = datetime('now')
    WHERE id LIKE 'np-%'`)
}

function upsertDeals (db) {
  for (const [id, name, qty, price, productId] of DEALS) {
    db.run("INSERT OR REPLACE INTO deals (id, name, type, config, active) VALUES (?1, ?2, 'multi_buy', ?3, 1)", [id, name, JSON.stringify({ qty, price })])
    db.run("DELETE FROM deal_products WHERE deal_id = ?1", [id])
    db.run("INSERT OR IGNORE INTO deal_products (deal_id, product_id, role) VALUES (?1, ?2, 'trigger')", [id, productId])
  }
}

function applyToSqlJsDb (db) {
  for (const [id, name, sortOrder, colour] of CATEGORIES) {
    db.run("INSERT OR IGNORE INTO categories (id, name, sort_order, colour, active, updated_at) VALUES (?1, ?2, ?3, ?4, 1, datetime('now'))", [id, name, sortOrder, colour])
  }
  for (const product of PRODUCTS) upsertProduct(db, product)

  for (const [name, price, unit] of EXACT_PRICE_UPDATES) updateExactName(db, name, price, unit)

  // Update common duplicates/imported names so item search and barcodes match the same shop prices.
  for (const [name, price, unit] of [
    ['CAPSICUM RED KG', 5.99, 'kg'], ['CAPSICUM YELLOW KG', 8.99, 'kg'], ['CAPSICUM GREEN KG', 7.99, 'kg'],
    ['CARROTS KG', 3.69, 'kg'], ['GARLIC KG', 29.89, 'kg'], ['GINGER KG', 34.99, 'kg'],
    ['MUSHROOM FLAT KG', 14.90, 'kg'], ['MUSHROOM SWISS BROWN KG', 16.90, 'kg'], ['MUSHROOM CUPS KG', 14.90, 'kg'],
    ['ONIONS BROWN KG', 2.99, 'kg'], ['ONIONS WHITE KG', 7.99, 'kg'], ['ONIONS SALAD/SPANISH KG', 4.99, 'kg'],
    ['10KG RED ONION', 18.00, 'each'], ['10KG BROWN ONION', 12.90, 'each'],
    ['PUMPKIN JAP KG', 2.49, 'kg'], ['PUMPKIN JAP CUT KG', 2.69, 'kg'], ['PUMPKIN BUTTERNUT KG', 2.49, 'kg'],
    ['PUMPKIN BUTTERNUT CUT KG', 2.99, 'kg'], ['PUMPKIN JARRA KG', 2.49, 'kg'], ['PUMPKIN JARRA CUT KG', 2.99, 'kg'],
    ['WATERMELON SEEDLESS WHOLE KG', 0.99, 'kg'], ['WATERMELON SEEDED LONG WHOLE KG', 0.99, 'kg'],
    ['GRAPES RED SEEDLESS KG', 5.99, 'kg'], ['GRAPES BLACK SEEDLESS KG', 5.99, 'kg'], ['GRAPE WHITE SEEDLESS KG', 7.89, 'kg'],
    ['TOMATOES TRUSS KG', 7.99, 'kg'], ['TOMATOES ROMA KG', 7.89, 'kg'], ['TOMATOES GOURMET KG', 6.89, 'kg']
  ]) updateExactName(db, name, price, unit)

  syncKeyboardButtons(db)
  upsertDeals(db)
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('spoken_shop_prices_20260521_v4', '1')")
  return { products: PRODUCTS.length, deals: DEALS.length }
}

function updateProductsJson () {
  if (!fs.existsSync(productsJsonPath)) return
  const data = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'))
  const byId = new Map(PRODUCTS.map(p => [p[0], p]))
  const seen = new Set()
  const products = (Array.isArray(data) ? data : data.products || []).map(product => {
    const row = byId.get(product.id)
    if (!row) return product
    seen.add(product.id)
    const [, name, category_id, price, unit, plu] = row
    return { ...product, name, category_id, price, unit, plu, barcode: product.barcode || plu, active: 1, open_price: 0 }
  })
  for (const row of PRODUCTS) {
    if (seen.has(row[0])) continue
    const [id, name, category_id, price, unit, plu] = row
    products.push({ id, barcode: plu, plu, name, category_id, price, cost_price: 0, unit, tax_rate: 0, track_stock: 0, stock_qty: 0, active: 1, open_price: 0 })
  }
  if (Array.isArray(data)) fs.writeFileSync(productsJsonPath, JSON.stringify(products, null, 2) + '\n')
  else fs.writeFileSync(productsJsonPath, JSON.stringify({ ...data, products }, null, 2) + '\n')
}

async function runStandalone () {
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))
  const result = applyToSqlJsDb(db)
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  db.close()
  updateProductsJson()
  console.log(`Applied ${result.products} spoken shop price product rows and ${result.deals} deals.`)
}

if (require.main === module) {
  runStandalone().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { PRODUCTS, DEALS, CATEGORIES, applyToSqlJsDb }
