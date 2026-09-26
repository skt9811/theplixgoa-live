// Idempotent seed of the Cope Cafe / Harbor Court POS menu into pmsDb.
// Run: node src/scripts/seed-pos-menu.ts   (reads NEON_PMS_DATABASE_URL from .env.local)
import postgres from "postgres";

const PROPERTY_ID = "harbor-court";

// "Item | price | Veg|Non-veg | kitchen|bar" grouped under "## CATEGORY"
const MENU = `
## TEA
Masala Tea|40|Veg|kitchen
Black Tea|30|Veg|kitchen
Lemon Tea|30|Veg|kitchen
Green Tea|40|Veg|kitchen
Tulsi Tea|30|Veg|kitchen
Ginger Tea|30|Veg|kitchen
Yogi Tea|50|Veg|kitchen
Darjeeling Tea|50|Veg|kitchen
Ginger Honey Lemon Tea|50|Veg|kitchen
Lemon Ice Tea|50|Veg|kitchen
Masala Tea Pot|100|Veg|kitchen
Milk Tea|40|Veg|kitchen
Ginger Milk Tea|40|Veg|kitchen
## COFFEE
Milk Coffee|60|Veg|kitchen
Cold Coffee|160|Veg|kitchen
Ice Coffee|90|Veg|kitchen
Cappuccino Hot Milk|100|Veg|kitchen
Hot Milk|100|Veg|kitchen
Hot Chocolate Milk|160|Veg|kitchen
Full Cream Milk|120|Veg|kitchen
Black Coffee|40|Veg|kitchen
## JUICES
Watermelon Papaya|140|Veg|kitchen
Orange Juice|120|Veg|kitchen
Mango Juice|160|Veg|kitchen
Pineapple Juice|140|Veg|kitchen
Apple Juice|220|Veg|kitchen
Strawberry Juice|120|Veg|kitchen
Beetroot Juice|100|Veg|kitchen
Grapes Juice|150|Veg|kitchen
Carrot Juice|120|Veg|kitchen
Mix-Fruit Juice|150|Veg|kitchen
Lemonade|120|Veg|kitchen
A.B.C Juice|120|Veg|kitchen
## SHAKE
Mango Shake|160|Veg|kitchen
Banana Shake|130|Veg|kitchen
Watermelon Shake|140|Veg|kitchen
Papaya Shake|120|Veg|kitchen
Chikku Shake|120|Veg|kitchen
Strawberry Shake|140|Veg|kitchen
Mix-Fruit Shake|150|Veg|kitchen
## COLD DRINKS
Coca Cola|70|Veg|kitchen
Sprite Can|60|Veg|kitchen
Sting|70|Veg|kitchen
Soda|50|Veg|kitchen
Water|40|Veg|kitchen
Red Bull|150|Veg|kitchen
Diet Coke|70|Veg|kitchen
Lemon Soda|60|Veg|kitchen
Lemon Water|50|Veg|kitchen
Coke Small|30|Veg|kitchen
Limca|30|Veg|kitchen
Sprite|30|Veg|kitchen
## SMOOTHIE
Papaya Mango Smoothie|160|Veg|kitchen
Avocado Mango Smoothie|200|Veg|kitchen
Avocado Banana Smoothie|200|Veg|kitchen
Chikku Avocado Smoothie|200|Veg|kitchen
Strawberry Mango Smoothie|180|Veg|kitchen
Avocado Strawberry Smoothie|220|Veg|kitchen
Mix-Fruit Smoothie|220|Veg|kitchen
## LASSI
Banana Lassi|120|Veg|kitchen
Mango Lassi|140|Veg|kitchen
Papaya Lassi|100|Veg|kitchen
Strawberry Lassi|120|Veg|kitchen
Chikku Lassi|150|Veg|kitchen
Avocado Lassi|180|Veg|kitchen
Mix-Fruit Lassi|160|Veg|kitchen
Plain Lassi|100|Veg|kitchen
Sweet Lassi|120|Veg|kitchen
Butter Milk|90|Veg|kitchen
## OMELETTE WITH BREAD
Masala Omelet|140|Non-veg|kitchen
Plain Omelet|120|Non-veg|kitchen
Cheese Omelet|160|Non-veg|kitchen
Chicken Omelet|200|Non-veg|kitchen
Prawns Omelet|200|Non-veg|kitchen
Cheese Tomato Omelet|160|Non-veg|kitchen
Potato Omelet|140|Non-veg|kitchen
Cheese Mushroom Omelet|160|Non-veg|kitchen
Bread Omelette|140|Non-veg|kitchen
## BREAD TOAST
Butter Toast|60|Veg|kitchen
Jam Toast|60|Veg|kitchen
Nutella Toast|80|Veg|kitchen
Plain Toast|100|Veg|kitchen
Cheese Jam Toast|120|Veg|kitchen
Nutella Bananas Toast|120|Veg|kitchen
Strawberry Nutella Toast|140|Veg|kitchen
## SANDWICH CHIPS & SALADS
Cheese Sandwich|160|Veg|kitchen
Cheese Tomato Sandwich|170|Veg|kitchen
Cheese Chicken Sandwich|240|Non-veg|kitchen
Veg Sandwich|160|Veg|kitchen
Chicken Sandwich|220|Non-veg|kitchen
Prawns Sandwich|220|Non-veg|kitchen
Tuna Sandwich|280|Non-veg|kitchen
Sandwich Egg Cheese|200|Non-veg|kitchen
## BURGER WITH CHIPS
Veg Burger|200|Veg|kitchen
Veg Cheese Burger|220|Veg|kitchen
Chicken Burger|220|Non-veg|kitchen
Prawns Burger|160|Non-veg|kitchen
Fish Burger|140|Non-veg|kitchen
Tuna Burger|140|Non-veg|kitchen
Mushroom Cheese Burger|200|Veg|kitchen
## EGG PARTY
Boiled Egg|80|Non-veg|kitchen
Fried Egg|80|Non-veg|kitchen
Scrambled Egg|120|Non-veg|kitchen
Poached Egg|100|Non-veg|kitchen
Egg Bhurji|150|Non-veg|kitchen
Egg Curry|180|Non-veg|kitchen
Egg Masala|200|Non-veg|kitchen
Half Fry|80|Non-veg|kitchen
## YOGA SPECIAL
Banana Porridge|140|Veg|kitchen
Plain Porridge|120|Veg|kitchen
Mix Fruit Porridge|180|Veg|kitchen
Oatmeal|150|Veg|kitchen
Mix Fruit Muesli|200|Veg|kitchen
Corn Flakes|100|Veg|kitchen
## PASTA
Veg Pasta|200|Veg|kitchen
Chicken Pasta|230|Non-veg|kitchen
Prawns Pasta|250|Non-veg|kitchen
Sea Food Pasta|300|Non-veg|kitchen
White Sauce Pasta|280|Veg|kitchen
Red Sauce Pasta|260|Veg|kitchen
Paneer Pasta|260|Veg|kitchen
Broccoli Pasta|300|Veg|kitchen
White Sauce Chicken Pasta|280|Non-veg|kitchen
## PANCAKE
Plain Pancake|120|Veg|kitchen
Lemon Pancake|120|Veg|kitchen
Honey Pancake|130|Veg|kitchen
Chocolate Pancake|160|Veg|kitchen
Nutella Pancake|180|Veg|kitchen
Nutella Banana Pancake|190|Veg|kitchen
Strawberry Pancake|160|Veg|kitchen
Peanut Butter Pancake|180|Veg|kitchen
Mix Fruit Pancake|160|Veg|kitchen
## SALAD
Green Salad|140|Veg|kitchen
Fruit Salad|220|Veg|kitchen
Avocado Salad|280|Veg|kitchen
Caesar Salad|180|Veg|kitchen
Prawns Salad|300|Non-veg|kitchen
Tuna Olive Salad|280|Non-veg|kitchen
Chicken Salad|240|Non-veg|kitchen
Sea Food Salad|320|Non-veg|kitchen
## SOUP
Veg Soup|100|Veg|kitchen
Veg Clear Soup|120|Veg|kitchen
Veg Manchow Soup|140|Veg|kitchen
Hot and Sour Soup|140|Veg|kitchen
Tomato Soup|120|Veg|kitchen
Cream of Mushroom Soup|160|Veg|kitchen
Chicken Soup|160|Non-veg|kitchen
Chicken Clear Soup|180|Non-veg|kitchen
Chicken Manchow Soup|180|Non-veg|kitchen
Cream Of Chicken Soup|200|Non-veg|kitchen
Prawns Soup|220|Non-veg|kitchen
Sea Food Soup|260|Non-veg|kitchen
Carrot and Beetroot Soup|180|Veg|kitchen
## NOODLES
Veg Noodles|200|Veg|kitchen
Chicken Noodles|260|Non-veg|kitchen
Hakka Noodles|220|Veg|kitchen
Egg Noodles|220|Non-veg|kitchen
Chicken Hakka Noodles|260|Non-veg|kitchen
Veg Hakka Noodles|220|Veg|kitchen
Schezwan Noodles|230|Veg|kitchen
Prawns Noodles|260|Non-veg|kitchen
Sea Food Noodles|280|Non-veg|kitchen
Manchow Noodles|220|Veg|kitchen
## MOMOS
Veg Momos|240|Veg|kitchen
Potato Momos|220|Veg|kitchen
Cheese Momos|260|Veg|kitchen
Potato Cheese Momos|260|Veg|kitchen
Spinach Momos|260|Veg|kitchen
Chicken Momos|300|Non-veg|kitchen
Prawns Momos|380|Non-veg|kitchen
Sea Food Momos|380|Non-veg|kitchen
## VEG STARTER
Peanut Masala|120|Veg|kitchen
Papad Masala|70|Veg|kitchen
Roasted Papad|70|Veg|kitchen
Finger Chips|140|Veg|kitchen
Veg Pakora|140|Veg|kitchen
Onion Pakora|160|Veg|kitchen
Paneer Pakora|200|Veg|kitchen
Cheese Pakora|260|Veg|kitchen
Cheese Balls|260|Veg|kitchen
Onion Rings|140|Veg|kitchen
Veg Crispy|200|Veg|kitchen
Paneer Crispy|220|Veg|kitchen
Paneer 65|220|Veg|kitchen
Paneer Chilly|220|Veg|kitchen
Garlic Paneer|220|Veg|kitchen
Veg Manchurian|200|Veg|kitchen
Gobi Manchurian|200|Veg|kitchen
Honey Chilly Potato|180|Veg|kitchen
Paneer Fingers|200|Veg|kitchen
Poha|120|Veg|kitchen
Masala Maggi|100|Veg|kitchen
Plain Maggi|80|Veg|kitchen
Crispy Corn|200|Veg|kitchen
Rasam|250|Veg|kitchen
## NON-VEG STARTER
Chicken Pakora|280|Non-veg|kitchen
Chicken Lollipop|260|Non-veg|kitchen
Chicken Crispy|240|Non-veg|kitchen
Chicken 65|260|Non-veg|kitchen
Chicken Garlic|260|Non-veg|kitchen
Chicken Manchurian|260|Non-veg|kitchen
Chicken Dry Fry|280|Non-veg|kitchen
Fish Fingers|300|Non-veg|kitchen
Fish And Chips|320|Non-veg|kitchen
Prawns Chilly|380|Non-veg|kitchen
Prawns Masala Fry|380|Non-veg|kitchen
Prawns Golden Fry|400|Non-veg|kitchen
Calamari Golden Fry|340|Non-veg|kitchen
Calamari Masala Fry|340|Non-veg|kitchen
Mackerel Masala Fry|460|Non-veg|kitchen
Mackerel Rava Fry|480|Non-veg|kitchen
Chicken Chilly|260|Non-veg|kitchen
Egg Maggi|120|Non-veg|kitchen
## VEG MAIN COURSE
Mix Veg|200|Veg|kitchen
Veg Kadhai|180|Veg|kitchen
Mushroom Masala|260|Veg|kitchen
Dal Fry|180|Veg|kitchen
Dal Tadka|200|Veg|kitchen
Jeera Aloo|200|Veg|kitchen
Dum Aloo|220|Veg|kitchen
Aloo Gobhi|220|Veg|kitchen
Mushroom Matar|240|Veg|kitchen
Malai Kofta|260|Veg|kitchen
Aloo Pyaz|220|Veg|kitchen
Kadhai Paneer|290|Veg|kitchen
Palak Paneer|300|Veg|kitchen
Matar Paneer|320|Veg|kitchen
Shahi Paneer|340|Veg|kitchen
Paneer Butter Masala|320|Veg|kitchen
## NON-VEG MAIN COURSE
Chicken Curry|290|Non-veg|kitchen
Kadhai Chicken|290|Non-veg|kitchen
Chicken Masala|290|Non-veg|kitchen
Butter Chicken|340|Non-veg|kitchen
Chicken Handi|340|Non-veg|kitchen
Chicken Do Pyaza|320|Non-veg|kitchen
Chicken Kolhapuri|290|Non-veg|kitchen
Chicken Korma|340|Non-veg|kitchen
Chicken Balchao|340|Non-veg|kitchen
Prawns Masala|340|Non-veg|kitchen
Prawns Curry|360|Non-veg|kitchen
Fish Masala|360|Non-veg|kitchen
Fish Curry|380|Non-veg|kitchen
King Fish Masala|400|Non-veg|kitchen
## NAN ROTI PARATHA
Plain Roti|30|Veg|kitchen
Butter Roti|40|Veg|kitchen
Plain Naan|80|Veg|kitchen
Butter Naan|120|Veg|kitchen
Paratha Plain|40|Veg|kitchen
Paratha Butter|50|Veg|kitchen
Laccha Paratha|100|Veg|kitchen
Aloo Paratha|140|Veg|kitchen
Gobi Paratha|140|Veg|kitchen
Cheese Naan|140|Veg|kitchen
Cheese Garlic Naan|140|Veg|kitchen
Garlic Naan|120|Veg|kitchen
Paneer Paratha|160|Veg|kitchen
Green Chilly Naan|120|Veg|kitchen
Cheese Aloo Paratha|170|Veg|kitchen
## RICE AND BIRYANI
Plain Rice|120|Veg|kitchen
Jeera Rice|140|Veg|kitchen
Veg Pulao|240|Veg|kitchen
Lemon Rice|140|Veg|kitchen
Veg Biryani|220|Veg|kitchen
Veg Fried Rice|200|Veg|kitchen
Schezwan Fried Rice|220|Veg|kitchen
Chicken Fried Rice|260|Non-veg|kitchen
Chicken Biryani|280|Non-veg|kitchen
Prawns Fried Rice|340|Non-veg|kitchen
Prawns Biryani|380|Non-veg|kitchen
Egg Fried Rice|240|Non-veg|kitchen
Egg Biryani|260|Non-veg|kitchen
Sea Food Fried Rice|320|Non-veg|kitchen
Sea Food Biryani|360|Non-veg|kitchen
Chicken Schezwan Fried Rice|280|Non-veg|kitchen
## SEA FOOD
## BEVERAGES
Coke Can|60|Veg|bar
Pepsi|70|Veg|bar
Red Bull Can|160|Veg|bar
Minute Maid|40|Veg|bar
Tonic Water|70|Veg|bar
Limca Can|70|Veg|bar
Thums Up Bottle|20|Veg|bar
Fanta Bottle|20|Veg|bar
Sprite Bottle|20|Veg|bar
Coke Bottle|20|Veg|bar
Drinking Water|30|Veg|bar
## BEER PINT
Kingfisher Premium|110|Veg|bar
Kings Beer|110|Veg|bar
Kingfisher Ultra|140|Veg|bar
Budweiser Premium|120|Veg|bar
Tuborg Premium|100|Veg|bar
Budweiser Magnum|130|Veg|bar
Breezer All Flavors|160|Veg|bar
Corona|155|Veg|bar
Kingfisher Strong|180|Veg|bar
Tuborg Strong Can|140|Veg|bar
Carlsberg Premium Smooth|110|Veg|bar
Hoegaarden Can|160|Veg|bar
Desmondji|300|Veg|bar
Blue Margarita|320|Veg|bar
Margarita|300|Veg|bar
Port Wine|100|Veg|bar
Sula Wine|300|Veg|bar
## RUM/WHISKY/VODKA
Royal Stag|120|Veg|bar
Royal Challenge|120|Veg|bar
Blenders Pride|160|Veg|bar
Signature|180|Veg|bar
Teachers|300|Veg|bar
Black & White|370|Veg|bar
Black Dog|370|Veg|bar
Vat 69|300|Veg|bar
Vat 69 (30ml)|150|Veg|bar
Old Monk|80|Veg|bar
McDowell's White Rum|140|Veg|bar
Bacardi White Rum|210|Veg|bar
Romanov Vodka|80|Veg|bar
Smirnoff Vodka|200|Veg|bar
Magic Moments Vodka|300|Veg|bar
Absolut Vodka|300|Veg|bar
`;

const url = process.env["NEON_PMS_DATABASE_URL"] ?? (process.loadEnvFile(".env.local"), process.env["NEON_PMS_DATABASE_URL"]);
if (!url) throw new Error("NEON_PMS_DATABASE_URL is not set");
const sql = postgres(url, { ssl: "require", max: 1 });

const groups: { name: string; items: { name: string; price: number; veg: boolean; dest: string }[] }[] = [];
for (const line of MENU.split("\n")) {
  if (line.startsWith("## ")) groups.push({ name: line.slice(3).trim(), items: [] });
  else if (line.trim()) {
    const [name, price, kind, dest] = line.split("|").map((p) => p.trim());
    groups[groups.length - 1]!.items.push({ name: name!, price: Number(price), veg: kind === "Veg", dest: dest! });
  }
}

let catsAdded = 0;
let itemsAdded = 0;
let itemsUpdated = 0;
await sql.begin(async (tx) => {
  const [m] = await tx<{ k: number }[]>`SELECT COALESCE(max(sort_order), -1)::int + 1 AS k FROM pms_pos_categories WHERE property_id = ${PROPERTY_ID}`;
  let order = m!.k;
  for (const g of groups) {
    let [cat] = await tx<{ id: string; name: string }[]>`SELECT id, name FROM pms_pos_categories WHERE property_id = ${PROPERTY_ID} AND lower(name) = lower(${g.name})`;
    if (!cat) {
      [cat] = await tx<{ id: string; name: string }[]>`INSERT INTO pms_pos_categories (property_id, name, sort_order) VALUES (${PROPERTY_ID}, ${g.name}, ${order++}) RETURNING id, name`;
      catsAdded++;
    }
    for (const it of g.items) {
      const [found] = await tx<{ id: string }[]>`SELECT id FROM pms_pos_items WHERE property_id = ${PROPERTY_ID} AND category_id = ${cat!.id} AND lower(name) = lower(${it.name})`;
      if (found) {
        await tx`UPDATE pms_pos_items SET price = ${it.price}, is_veg = ${it.veg}, printer_destination = ${it.dest}, category_name = ${cat!.name} WHERE id = ${found.id}`;
        itemsUpdated++;
      } else {
        await tx`INSERT INTO pms_pos_items (property_id, category_id, category_name, name, price, is_veg, printer_destination) VALUES (${PROPERTY_ID}, ${cat!.id}, ${cat!.name}, ${it.name}, ${it.price}, ${it.veg}, ${it.dest})`;
        itemsAdded++;
      }
    }
  }
});
const [cc] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_categories WHERE property_id = ${PROPERTY_ID}`;
const [ic] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_items WHERE property_id = ${PROPERTY_ID}`;
console.log(`${PROPERTY_ID}: +${catsAdded} categories, +${itemsAdded} items, ${itemsUpdated} refreshed. Totals now: ${cc?.n} categories, ${ic?.n} items.`);
await sql.end();
