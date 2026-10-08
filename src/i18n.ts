// Shows the app in Bangla.
//
// The screens are written in English. Rather than touching every one of them,
// this watches the page and swaps each piece of interface text for its Bangla
// from the list below. Text the shop typed in itself (product names, customer
// names...) is left alone: only exact matches from the list are replaced, and
// table cells only for a short list of status words.
//
// To translate something new, add a line to `words`, or to `patterns` when the
// text contains a number or a name.

export type Language = "bn" | "en";

const STORAGE_KEY = "hishabpos_language";

export function currentLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "bn";
  } catch {
    return "bn";
  }
}

/** Remembers the choice and reloads, so every screen is drawn again in that language. */
export function switchLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Without storage the choice cannot be kept, so there is nothing to switch to.
    return;
  }
  window.location.reload();
}

const words: Record<string, string> = {
  // ---- menu
  "Dashboard": "ড্যাশবোর্ড", "Sales": "বিক্রি", "Sale New": "নতুন বিক্রি", "Sale List": "বিক্রির তালিকা", "Sales Return": "বিক্রি ফেরত",
  "Purchases": "ক্রয়", "Purchase New": "নতুন ক্রয়", "Purchase List": "ক্রয়ের তালিকা", "Purchase Return": "ক্রয় ফেরত",
  "Products": "পণ্য", "All Product": "সব পণ্য", "Add Product": "পণ্য যোগ", "Category": "ক্যাটাগরি", "Brand": "ব্র্যান্ড", "Unit": "একক",
  "Stock List": "স্টকের তালিকা", "Employee": "কর্মচারী", "Salary Slip": "বেতন স্লিপ", "Warehouse": "গুদাম", "Warehouse Transfer": "গুদাম স্থানান্তর",
  "Customers": "গ্রাহক", "Suppliers": "সরবরাহকারী", "Expenses": "খরচ", "Due List": "বাকির তালিকা", "Subscription": "সাবস্ক্রিপশন",
  "Profit & Loss List": "লাভ-ক্ষতির তালিকা", "Profile": "প্রোফাইল", "Settings": "সেটিংস", "Currencies": "মুদ্রা", "Notifications": "নোটিফিকেশন",
  "General Settings": "সাধারণ সেটিংস", "User Role": "ইউজার রোল", "Notes": "নোট", "Backup": "ব্যাকআপ", "Admin": "অ্যাডমিন",
  "All Shops": "সব দোকান", "Payments": "পেমেন্ট", "Pricing": "দাম নির্ধারণ", "My Profile": "আমার প্রোফাইল", "Logout": "লগ আউট", "Log Out": "লগ আউট",
  "Theme": "থিম", "Menu": "মেনু", "Hello 👋": "স্বাগতম 👋", "Open profile menu": "প্রোফাইল মেনু খুলুন",

  // ---- dashboard
  "Total Sales": "মোট বিক্রি", "Total Sale": "মোট বিক্রি", "Total Purchase": "মোট ক্রয়", "Total Expense": "মোট খরচ", "Total Customer": "মোট গ্রাহক",
  "Total Supplier": "মোট সরবরাহকারী", "Sales Returns": "বিক্রি ফেরত", "Purchase Returns": "ক্রয় ফেরত", "Net Profit": "নিট লাভ",
  "Today's Courier Orders": "আজকের কুরিয়ার অর্ডার", "Gross Profit": "মোট লাভ", "Loss": "ক্ষতি", "Recent Sales": "সাম্প্রতিক বিক্রি",
  "Recent Purchase": "সাম্প্রতিক ক্রয়", "Low Stock": "কম স্টক", "Current Stock": "বর্তমান স্টক", "Alert Qty": "সতর্কতার পরিমাণ",
  "Quick Action": "দ্রুত কাজ", "Nothing needs your attention.": "এখন দেখার মতো কিছু নেই।", "Out of stock": "স্টক শেষ", "This Month": "এই মাসে", "Purchase:": "ক্রয়:", "Sales:": "বিক্রি:", "Net Profit:": "নিট লাভ:", "Gross Profit:": "মোট লাভ:",
  "Loss:": "ক্ষতি:", "Expense:": "খরচ:", "Expense": "খরচ", "Purchase": "ক্রয়", "Discount (৳)": "ছাড় (৳)",
  "Jan": "জানু", "Feb": "ফেব্রু", "Mar": "মার্চ", "Apr": "এপ্রিল", "May": "মে", "Jun": "জুন", "Jul": "জুলাই", "Aug": "আগস্ট", "Sep": "সেপ্টে", "Oct": "অক্টো", "Nov": "নভে", "Dec": "ডিসে",

  // ---- common
  "Action": "কাজ", "Edit": "এডিট", "Delete": "মুছুন", "Save": "সেভ", "Save Changes": "পরিবর্তন সেভ করুন", "Cancel": "বাতিল", "Print": "প্রিন্ট",
  "Save PDF": "PDF সেভ", "Export CSV": "CSV নামান", "Export Excel-compatible CSV": "Excel-এর জন্য CSV নামান", "Reset": "রিসেট", "Next": "পরের",
  "Previous": "আগের", "Search...": "খুঁজুন...", "Search products": "পণ্য খুঁজুন", "Search product...": "পণ্য খুঁজুন...", "Select one": "একটি বাছুন",
  "Select all": "সব বাছুন", "Yes": "হ্যাঁ", "No": "না", "Active": "সক্রিয়", "Inactive": "নিষ্ক্রিয়", "Status": "অবস্থা", "Date": "তারিখ",
  "Name": "নাম", "Phone": "ফোন", "Address": "ঠিকানা", "Email": "ইমেইল", "Email address": "ইমেইল ঠিকানা", "Email Address": "ইমেইল ঠিকানা",
  "Password": "পাসওয়ার্ড", "Amount": "টাকার পরিমাণ", "Total": "মোট", "Total Amount": "মোট টাকা", "Note": "নোট", "Title": "শিরোনাম", "Type": "ধরন",
  "SL.": "ক্রমিক", "Code": "কোড", "Price": "দাম", "Qty": "পরিমাণ", "Quantity:": "পরিমাণ:", "Item": "পণ্য", "Cost": "খরচ", "Location": "অবস্থান",
  "From": "থেকে", "To": "পর্যন্ত", "to": "থেকে", "Month": "মাস", "Salary": "বেতন", "Mobile": "মোবাইল", "Method": "মাধ্যম", "Size": "আকার",
  "Download": "নামান", "Restore": "ফিরিয়ে আনুন", "Loading…": "লোড হচ্ছে…", "Rows per page": "প্রতি পাতায় সারি", "All Pages": "সব পাতা",
  "Current Page": "এই পাতা", "Select Date Range": "তারিখের সীমা বাছুন", "Access restricted": "প্রবেশাধিকার নেই", "No data yet": "এখনো কোনো তথ্য নেই", "No data found": "কোনো তথ্য পাওয়া যায়নি", "No products found": "কোনো পণ্য পাওয়া যায়নি",
  "Your account has not been assigned access to any section.": "আপনার একাউন্টকে কোনো অংশে ঢোকার অনুমতি দেওয়া হয়নি।",
  "Please wait while your account and shop information loads.": "আপনার একাউন্ট ও দোকানের তথ্য লোড হচ্ছে, অপেক্ষা করুন।",

  // ---- products
  "Product": "পণ্য", "Product List": "পণ্যের তালিকা", "Add New Product": "নতুন পণ্য যোগ", "Edit Product": "পণ্য এডিট", "Product Name": "পণ্যের নাম",
  "Product Code": "পণ্যের কোড", "Product Category": "পণ্যের ক্যাটাগরি", "Product Brand": "পণ্যের ব্র্যান্ড", "Product Unit": "পণ্যের একক",
  "WareHouse": "গুদাম", "Stock": "স্টক", "Low Stock Alert": "কম স্টকের সতর্কতা", "Purchase Price": "ক্রয়মূল্য", "Sale Price": "বিক্রয়মূল্য",
  "MRP Price": "MRP দাম", "Wholesale Price": "পাইকারি দাম", "Dealer Price": "ডিলার দাম", "Manufacturer": "প্রস্তুতকারক",
  "Manufacture Date": "উৎপাদনের তারিখ", "Expire Date": "মেয়াদ শেষের তারিখ", "Image": "ছবি", "Has Serial": "সিরিয়াল আছে", "Serial": "সিরিয়াল",
  "Serial No.": "সিরিয়াল নং", "Available Serial Numbers": "মজুত সিরিয়াল নম্বর", "No image": "ছবি নেই", "No product found": "কোনো পণ্য পাওয়া যায়নি",
  "Replace Image (optional, max 200 KB)": "ছবি বদলান (ঐচ্ছিক, সর্বোচ্চ ২০০ KB)", "Image (max 200 KB)": "ছবি (সর্বোচ্চ ২০০ KB)",
  "Enter Product Name": "পণ্যের নাম লিখুন", "Enter Product Code": "পণ্যের কোড লিখুন", "Enter stock qty": "স্টকের পরিমাণ লিখুন",
  "Enter purchase price": "ক্রয়মূল্য লিখুন", "Enter MRP price": "MRP দাম লিখুন", "Enter wholesale price": "পাইকারি দাম লিখুন",
  "Enter dealer price": "ডিলার দাম লিখুন", "Enter manufacturer name": "প্রস্তুতকারকের নাম লিখুন", "Enter serial number": "সিরিয়াল নম্বর লিখুন",
  "Enter one serial number per line, or separate with commas": "প্রতি লাইনে একটি সিরিয়াল নম্বর লিখুন, অথবা কমা দিয়ে আলাদা করুন",
  "Filter by brand": "ব্র্যান্ড দিয়ে বাছুন", "Filter by category": "ক্যাটাগরি দিয়ে বাছুন", "EX: 5": "যেমন: ৫",
  "Print Barcode": "বারকোড প্রিন্ট", "Number of labels": "লেবেলের সংখ্যা", "Labels per row": "প্রতি সারিতে লেবেল", "Add to list": "তালিকায় যোগ করুন",
  "Add all products (one label per item in stock)": "সব পণ্য যোগ করুন (স্টকের প্রতিটির জন্য একটি লেবেল)", "Clear list": "তালিকা খালি করুন", "Preview": "নমুনা",
  "Choose a product first": "আগে একটি পণ্য বাছুন", "Allow pop-ups to print the labels": "লেবেল প্রিন্ট করতে pop-up চালু করুন",
  "Each label carries the product's code as a barcode. On the Sale screen, scan a label to add that product to the bill.": "প্রতিটি লেবেলে পণ্যের কোড বারকোড আকারে থাকে। বিক্রির পাতায় লেবেল স্ক্যান করলে পণ্যটি বিলে যোগ হয়।",
  "Print All": "সব প্রিন্ট করুন",
  "Print All prints every product in the list. To print one product, use the Print button on its row.": "\"সব প্রিন্ট করুন\" তালিকার সব পণ্য ছাপে। শুধু একটি পণ্য ছাপতে তার সারির প্রিন্ট বাটন চাপুন।",
  "1. Choose products": "১. পণ্য বাছুন", "2. Label and printer": "২. লেবেল ও প্রিন্টার", "3. Preview": "৩. নমুনা", "Search": "খুঁজুন",
  "Barcode quality": "বারকোডের মান", "Good": "ভালো", "Thin, may not scan": "চিকন, স্ক্যান নাও হতে পারে", "Does not fit": "জায়গা হয় না",
  "Printer": "প্রিন্টার", "Label printer (roll)": "লেবেল প্রিন্টার (রোল)", "A4 sheet (normal printer)": "A4 কাগজ (সাধারণ প্রিন্টার)",
  "Page direction": "পাতার দিক", "Portrait (tall)": "Portrait (লম্বালম্বি)", "Landscape (wide)": "Landscape (আড়াআড়ি)",
  "Portrait (label turned sideways)": "Portrait (লেবেল ঘুরিয়ে)", "Landscape (label as it is)": "Landscape (লেবেল যেমন আছে)",
  "Printer sharpness": "প্রিন্টারের সূক্ষ্মতা", "203 dpi (most label printers)": "২০৩ dpi (বেশিরভাগ লেবেল প্রিন্টার)", "600 dpi (laser or inkjet)": "৬০০ dpi (লেজার বা ইংকজেট)",
  "Custom size": "নিজের মাপ", "Labels across the roll": "রোলের এক সারিতে লেবেল", "Gap between labels (mm)": "লেবেলের মাঝের ফাঁক (মিমি)",
  "Text size (pt)": "লেখার আকার (pt)", "Move right (mm)": "ডানে সরান (মিমি)", "Move down (mm)": "নিচে সরান (মিমি)",
  "Shown at the size it will print. The dashed line is the edge of the label and is not printed.": "যে মাপে ছাপা হবে সেই মাপেই দেখানো হচ্ছে। দাগ-কাটা রেখাটি লেবেলের কিনারা, এটি ছাপা হয় না।",
  "A code marked \"Does not fit\" is too long for this label. Use a wider label or a shorter code.": "\"জায়গা হয় না\" লেখা কোডটি এই লেবেলের জন্য বেশি লম্বা। চওড়া লেবেল বা ছোট কোড ব্যবহার করুন।",
  "A barcode marked \"Thin\" has very narrow bars. A wider label or a shorter code makes it scan more reliably.": "\"চিকন\" লেখা বারকোডের দাগ খুব সরু। চওড়া লেবেল বা ছোট কোড দিলে স্ক্যান ভালো হবে।",
  "Label size": "লেবেলের মাপ", "Paper": "কাগজ", "A4 sheet": "A4 কাগজ", "Label printer (one label per page)": "লেবেল প্রিন্টার (প্রতি পাতায় একটি লেবেল)",
  "Label width (mm)": "লেবেলের চওড়া (মিমি)", "Label height (mm)": "লেবেলের উচ্চতা (মিমি)", "Barcode height (mm)": "বারকোডের উচ্চতা (মিমি)",
  "Shown at the size it will print.": "যে মাপে ছাপা হবে সেই মাপেই দেখানো হচ্ছে।", "One label fewer": "একটি লেবেল কম", "One label more": "একটি লেবেল বেশি",
  "Category List": "ক্যাটাগরির তালিকা", "Brand List": "ব্র্যান্ডের তালিকা", "Unit List": "এককের তালিকা", "Stock Value": "স্টকের মূল্য",
  "Add new Brand": "নতুন ব্র্যান্ড যোগ", "Add new Category": "নতুন ক্যাটাগরি যোগ", "Add new Unit": "নতুন একক যোগ",
  "Add new Product": "নতুন পণ্য যোগ", "General": "সাধারণ", "No Brand": "ব্র্যান্ড ছাড়া", "Pcs": "পিস", "Set": "সেট", "Box": "বক্স", "Kg": "কেজি",

  // ---- sales and purchases
  "Sale": "বিক্রি", "Sales List": "বিক্রির তালিকা", "Sales Return List": "বিক্রি ফেরতের তালিকা", "Purchase Return List": "ক্রয় ফেরতের তালিকা",
  "Invoice": "ইনভয়েস", "Invoice No": "ইনভয়েস নং", "Customer": "গ্রাহক", "Party": "পক্ষ", "Party Name": "পক্ষের নাম", "Paid": "পরিশোধিত",
  "Due": "বাকি", "Returned": "ফেরত", "Paid Amount": "পরিশোধের পরিমাণ", "Due Amount": "বাকির পরিমাণ", "Receive Amount": "গৃহীত টাকা",
  "Change Amount": "ফেরত টাকা", "Return Amount": "ফেরতের পরিমাণ", "Discount": "ছাড়", "Shipping": "ডেলিভারি চার্জ", "Sub Total": "উপমোট",
  "Subtotal": "উপমোট", "Vat (%)": "ভ্যাট (%)", "VAT": "ভ্যাট", "Payment": "পেমেন্ট", "Payment Type": "পেমেন্টের ধরন", "Cash": "নগদ", "Card": "কার্ড",
  "Select Supplier": "সরবরাহকারী বাছুন", "Walk-in Customer": "সাধারণ গ্রাহক", "Walk-in customer name": "গ্রাহকের নাম", "Walk-in phone number": "গ্রাহকের ফোন নম্বর",
  "Scan a barcode, or enter a product code or serial number, then press Enter": "বারকোড স্ক্যান করুন, অথবা পণ্যের কোড বা সিরিয়াল নম্বর লিখে Enter চাপুন",
  "Barcode, product code or serial number": "বারকোড, পণ্যের কোড বা সিরিয়াল নম্বর",
  "Money Receipt": "টাকার রসিদ", "Invoice Wise": "ইনভয়েস অনুযায়ী", "Product Wise": "পণ্য অনুযায়ী", "Gross Loss/Profit": "মোট লাভ/ক্ষতি",
  "Gross Loss Profit List": "মোট লাভ-ক্ষতির তালিকা",

  // ---- people, money, stock
  "Customer List": "গ্রাহকের তালিকা", "Supplier List": "সরবরাহকারীর তালিকা", "Employee List": "কর্মচারীর তালিকা", "Expense List": "খরচের তালিকা",
  "Salary Slip List": "বেতন স্লিপের তালিকা", "Warehouse List": "গুদামের তালিকা", "Transfer List": "স্থানান্তরের তালিকা",
  "Add new Customer": "নতুন গ্রাহক যোগ", "Add new Supplier": "নতুন সরবরাহকারী যোগ", "Add new Employee": "নতুন কর্মচারী যোগ",
  "Add new Expense": "নতুন খরচ যোগ", "Add new Salary Slip": "নতুন বেতন স্লিপ যোগ", "Add new Warehouse": "নতুন গুদাম যোগ",
  "Add new Transfer": "নতুন স্থানান্তর যোগ", "Main Warehouse": "প্রধান গুদাম",

  // ---- profile and settings
  "User Profile": "ইউজার প্রোফাইল", "Current Password": "বর্তমান পাসওয়ার্ড", "New Password": "নতুন পাসওয়ার্ড", "Confirm password": "পাসওয়ার্ড নিশ্চিত করুন",
  "Confirm Password": "পাসওয়ার্ড নিশ্চিত করুন", "Enter your current password": "বর্তমান পাসওয়ার্ড লিখুন", "Enter new password": "নতুন পাসওয়ার্ড লিখুন",
  "Enter confirm password": "পাসওয়ার্ড আবার লিখুন", "Re-enter password": "পাসওয়ার্ড আবার লিখুন", "Shop Opening Balance": "দোকানের প্রারম্ভিক ব্যালেন্স",
  "Shop Opening Balance:": "দোকানের প্রারম্ভিক ব্যালেন্স:", "Shop Remaining Balance:": "দোকানের বর্তমান ব্যালেন্স:",
  "Profile Picture (max 200 KB)": "প্রোফাইলের ছবি (সর্বোচ্চ ২০০ KB)", "Shop Name": "দোকানের নাম", "Shop Logo (max 200 KB)": "দোকানের লোগো (সর্বোচ্চ ২০০ KB)",
  "Remove logo": "লোগো সরান", "Default Currency": "মূল মুদ্রা", "Current User Role": "বর্তমান ইউজারের রোল", "Default VAT (%)": "সাধারণ ভ্যাট (%)",
  "Invoice Footer": "ইনভয়েসের নিচের লেখা", "Shop information and defaults used in sales and receipts.": "দোকানের তথ্য, যা বিক্রি ও রসিদে ব্যবহার হয়।",
  "Add Currency": "মুদ্রা যোগ", "Edit Currency": "মুদ্রা এডিট", "Currency name": "মুদ্রার নাম", "Symbol": "চিহ্ন", "Exchange Rate": "বিনিময় হার",
  "Bangladeshi Taka": "বাংলাদেশি টাকা", "Choose which in-app alerts you want to enable.": "কোন কোন সতর্কবার্তা চালু রাখতে চান বেছে নিন।",
  "Low stock alerts": "কম স্টকের সতর্কতা", "Customer due reminders": "গ্রাহকের বাকির রিমাইন্ডার", "New sale notifications": "নতুন বিক্রির নোটিফিকেশন",
  "New purchase notifications": "নতুন ক্রয়ের নোটিফিকেশন", "Expense notifications": "খরচের নোটিফিকেশন", "User Roles": "ইউজার রোল", "Role": "রোল",
  "Role Name": "রোলের নাম", "Permissions": "অনুমতি", "Add Role": "রোল যোগ", "Add User Role": "ইউজার রোল যোগ", "Edit User Role": "ইউজার রোল এডিট",
  "User Title": "ইউজারের নাম", "Create Account": "একাউন্ট তৈরি করুন", "Cashier": "ক্যাশিয়ার",
  "Create a login account and choose the sections it can access.": "একটি লগইন একাউন্ট তৈরি করুন এবং সে কোন কোন অংশ দেখতে পারবে বেছে নিন।",
  "Update this role’s access to workspace sections.": "এই রোল কোন কোন অংশ দেখতে পারবে তা বদলান।",
  "At least 8 characters": "কমপক্ষে ৮ অক্ষর", "Add Note": "নোট যোগ", "Note title": "নোটের শিরোনাম", "e.g. Sales Executive": "যেমন: সেলস এক্সিকিউটিভ",
  "e.g. Sales Team": "যেমন: সেলস টিম",

  // ---- backup
  "Backups": "ব্যাকআপ", "Back up now": "এখনই ব্যাকআপ নিন", "Daily backup": "দৈনিক ব্যাকআপ", "Saved before a restore": "ফিরিয়ে আনার আগের কপি",
  "A copy of your shop is saved automatically every day and kept for 30 days. You can download a copy to keep yourself, or put the shop back to how it was on an earlier day.":
    "আপনার দোকানের একটি কপি প্রতিদিন নিজে থেকে সেভ হয় এবং ৩০ দিন রাখা হয়। আপনি কপি নামিয়ে নিজের কাছে রাখতে পারেন, অথবা দোকানকে আগের কোনো দিনের অবস্থায় ফিরিয়ে নিতে পারেন।",

  // ---- subscription
  "Current Plan": "বর্তমান প্ল্যান", "Buy Now": "এখনই কিনুন", "Renew": "নবায়ন করুন", "Subscribed": "চালু আছে", "Used": "ব্যবহৃত", "Ended": "শেষ",
  "How to pay": "যেভাবে টাকা দেবেন", "Plan": "প্ল্যান", "Paid with": "যা দিয়ে পাঠিয়েছেন", "Number you sent from": "যে নম্বর থেকে পাঠিয়েছেন",
  "Transaction ID": "ট্রানজেকশন আইডি", "Submit Payment": "পেমেন্ট জমা দিন", "Your payments": "আপনার পেমেন্ট", "Waiting for approval": "অনুমোদনের অপেক্ষায়",
  "approved": "অনুমোদিত", "rejected": "বাতিল", "pending": "অপেক্ষমাণ", "monthly": "মাসিক", "yearly": "বাৎসরিক",
  "Copy the Transaction ID (TrxID) from the confirmation message.": "কনফার্মেশন মেসেজ থেকে Transaction ID (TrxID) কপি করুন।",
  "Fill in the form below. Your plan starts as soon as the payment is checked.": "নিচের ফর্মটি পূরণ করুন। পেমেন্ট যাচাই হলেই আপনার প্ল্যান চালু হবে।",
  "This shop has lifetime access.": "এই দোকানের আজীবন ব্যবহারের সুবিধা আছে।",
  "The free trial or paid period has ended. Pay for a plan to continue using the shop.": "ফ্রি ট্রায়াল বা কেনা মেয়াদ শেষ হয়েছে। দোকান চালু রাখতে একটি প্ল্যান কিনুন।",
  "This shop has been suspended. Please contact support.": "এই দোকানটি বন্ধ রাখা হয়েছে। সাপোর্টে যোগাযোগ করুন।",
  "The shop owner needs to confirm the email address before the shop can be used.": "দোকান ব্যবহারের আগে মালিককে ইমেইল ঠিকানা নিশ্চিত করতে হবে।",
  "Only the shop owner can pay for the subscription.": "শুধু দোকানের মালিক সাবস্ক্রিপশনের টাকা দিতে পারেন।",
  "Payment submitted. Your plan will start as soon as it is checked.": "পেমেন্ট জমা হয়েছে। যাচাই হলেই আপনার প্ল্যান চালু হবে।",
  "HishabPOS subscription": "HishabPOS সাবস্ক্রিপশন", "Confirm your email address to keep using the shop.": "দোকান চালু রাখতে আপনার ইমেইল ঠিকানা নিশ্চিত করুন।",
  "The payment number has not been set up yet. Please contact support.": "টাকা পাঠানোর নম্বর এখনো বসানো হয়নি। সাপোর্টে যোগাযোগ করুন।",
  "e.g. 9FK3A7B2XY": "যেমন: 9FK3A7B2XY",
  "Send the link again": "লিংক আবার পাঠান", "Send again": "আবার পাঠান",
  "A new link has been sent. Check your inbox and spam folder.": "নতুন লিংক পাঠানো হয়েছে। Inbox ও Spam ফোল্ডার দেখুন।",
  "No internet. You can keep working: changes are saved on this device and sent when the internet is back.":
    "ইন্টারনেট নেই। কাজ চালিয়ে যান: পরিবর্তনগুলো এই ডিভাইসে সেভ হচ্ছে, ইন্টারনেট ফিরলে নিজে থেকে চলে যাবে।",

  // ---- admin
  "Shop": "দোকান", "Owner": "মালিক", "Joined": "যোগদান", "Staff": "কর্মী", "Records": "রেকর্ড", "Sent from": "যেখান থেকে পাঠানো",
  "+30 days": "+৩০ দিন", "+1 year": "+১ বছর", "Suspend": "বন্ধ করুন", "Confirm email": "ইমেইল নিশ্চিত করুন", "Approve": "অনুমোদন", "Reject": "বাতিল",
  "Email not confirmed": "ইমেইল নিশ্চিত হয়নি", "Lifetime": "আজীবন", "Expired": "মেয়াদ শেষ", "Suspended": "বন্ধ",
  "Pricing & Payment Numbers": "দাম ও পেমেন্টের নম্বর", "Monthly price (Taka)": "মাসিক দাম (টাকা)", "Yearly price (Taka)": "বাৎসরিক দাম (টাকা)",
  "Free trial (days)": "ফ্রি ট্রায়াল (দিন)", "Days allowed before email must be confirmed": "ইমেইল নিশ্চিত করার আগে যত দিন চলবে",
  "Support phone": "সাপোর্টের ফোন", "bKash number (customers send money here)": "বিকাশ নম্বর (গ্রাহক এখানে টাকা পাঠাবে)", "Nagad number": "নগদ নম্বর",
  "Check each Transaction ID in your bKash or Nagad app before approving. Approving adds the paid period to the shop straight away.":
    "অনুমোদনের আগে প্রতিটি Transaction ID আপনার বিকাশ বা নগদ অ্যাপে মিলিয়ে নিন। অনুমোদন করলেই দোকানের মেয়াদ বেড়ে যায়।",

  // ---- login screens
  "Log in to your account": "আপনার একাউন্টে লগইন করুন", "Welcome back. Enter your details to continue.": "স্বাগতম। চালিয়ে যেতে আপনার তথ্য দিন।",
  "Create your account": "নতুন একাউন্ট খুলুন", "Set up a new shop account in a minute.": "এক মিনিটে নতুন দোকানের একাউন্ট খুলুন।",
  "Forgot your password?": "পাসওয়ার্ড ভুলে গেছেন?", "Forgot password?": "পাসওয়ার্ড ভুলে গেছেন?",
  "Enter your email and we will send you a link to choose a new one.": "আপনার ইমেইল দিন, নতুন পাসওয়ার্ড বেছে নেওয়ার লিংক পাঠিয়ে দেব।",
  "Choose a new password": "নতুন পাসওয়ার্ড বেছে নিন", "Enter a new password for your account.": "আপনার একাউন্টের জন্য নতুন পাসওয়ার্ড দিন।",
  "Log In": "লগইন", "Log in": "লগইন করুন", "Send Reset Link": "রিসেট লিংক পাঠান", "Save New Password": "নতুন পাসওয়ার্ড সেভ করুন",
  "Your name": "আপনার নাম", "Shop name": "দোকানের নাম", "New password": "নতুন পাসওয়ার্ড", "Confirm new password": "নতুন পাসওয়ার্ড আবার দিন",
  "Enter your password": "আপনার পাসওয়ার্ড দিন", "Enter it again": "আবার লিখুন", "e.g. Rahim Uddin": "যেমন: রহিম উদ্দিন", "e.g. Rahim Store": "যেমন: রহিম স্টোর",
  "New here?": "নতুন এসেছেন?", "Create an account": "একাউন্ট খুলুন", "Already have an account?": "আগে থেকেই একাউন্ট আছে?", "Back to log in": "লগইনে ফিরে যান",
  "Please wait…": "অপেক্ষা করুন…", "Show password": "পাসওয়ার্ড দেখান", "Hide password": "পাসওয়ার্ড লুকান",
  "Run your whole shop from one place.": "পুরো দোকান চালান এক জায়গা থেকে।",
  "Sales, stock, customers and reports for your shop, ready on any device.": "বিক্রি, স্টক, গ্রাহক আর রিপোর্ট, সব ডিভাইসে হাতের কাছে।",
  "Fast billing with printable invoices": "দ্রুত বিল আর প্রিন্ট করার মতো ইনভয়েস", "Live stock and purchase tracking": "স্টক ও ক্রয়ের তাৎক্ষণিক হিসাব",
  "Separate staff logins with their own permissions": "কর্মীদের আলাদা লগইন ও আলাদা অনুমতি", "Email confirmed. Thank you!": "ইমেইল নিশ্চিত হয়েছে। ধন্যবাদ!",

  // ---- messages
  "Add at least one product": "কমপক্ষে একটি পণ্য যোগ করুন", "Allow pop-ups to open the invoice": "ইনভয়েস খুলতে pop-up চালু করুন", "Backup saved": "ব্যাকআপ সেভ হয়েছে",
  "Choose another default currency before deleting this one": "এটি মোছার আগে অন্য একটি মূল মুদ্রা বেছে নিন", "Could not load this image": "ছবিটি লোড করা যায়নি",
  "Could not load this profile picture": "প্রোফাইলের ছবিটি লোড করা যায়নি", "Currency saved": "মুদ্রা সেভ হয়েছে",
  "Enter a name, code, symbol, and positive exchange rate": "নাম, কোড, চিহ্ন ও সঠিক বিনিময় হার দিন",
  "Enter a serial number for each serialized unit": "প্রতিটি সিরিয়ালযুক্ত পণ্যের সিরিয়াল নম্বর দিন", "Enter a title and note": "শিরোনাম ও নোট লিখুন",
  "Enter your current password to change email or password": "ইমেইল বা পাসওয়ার্ড বদলাতে বর্তমান পাসওয়ার্ড দিন", "Fill in all fields": "সব ঘর পূরণ করুন",
  "General settings saved": "সাধারণ সেটিংস সেভ হয়েছে", "Image upload failed; the compressed image will stay with this product record.": "ছবি আপলোড হয়নি; ছোট করা ছবিটি পণ্যের সাথেই থাকবে।",
  "Invoice not found": "ইনভয়েস পাওয়া যায়নি", "Invoice updated": "ইনভয়েস আপডেট হয়েছে", "Login account created with this role": "এই রোল দিয়ে লগইন একাউন্ট তৈরি হয়েছে",
  "New password and confirmation do not match": "নতুন পাসওয়ার্ড দুটি মিলছে না", "Not enough stock": "যথেষ্ট স্টক নেই", "Sale saved with a due balance": "বিক্রি সেভ হয়েছে, কিছু টাকা বাকি আছে", "Sale saved": "বিক্রি সেভ হয়েছে", "Purchase saved": "ক্রয় সেভ হয়েছে", "Saved": "সেভ হয়েছে", "Note saved": "নোট সেভ হয়েছে",
  "Notification settings saved": "নোটিফিকেশন সেটিংস সেভ হয়েছে", "Password must be at least 8 characters": "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে",
  "Product saved": "পণ্য সেভ হয়েছে", "Product updated": "পণ্য আপডেট হয়েছে", "Profile updated": "প্রোফাইল আপডেট হয়েছে", "Return recorded": "ফেরত লেখা হয়েছে",
  "Role saved": "রোল সেভ হয়েছে", "Serial not found. For regular products, enter the product code.": "সিরিয়াল পাওয়া যায়নি। সাধারণ পণ্যের জন্য পণ্যের কোড লিখুন।",
  "Serial not in product stock. Add it in Product Edit first.": "এই সিরিয়াল পণ্যের স্টকে নেই। আগে পণ্য এডিট থেকে যোগ করুন।", "Serial number is required": "সিরিয়াল নম্বর দিতে হবে",
  "The Admin role cannot be deleted": "Admin রোল মোছা যাবে না", "The logo could not be uploaded. Try again.": "লোগো আপলোড হয়নি। আবার চেষ্টা করুন।",
  "This product is out of stock": "এই পণ্যের স্টক শেষ", "This serial number has already been sold or added": "এই সিরিয়াল নম্বরটি আগেই বিক্রি বা যোগ হয়েছে",
  "Your login has expired. Please log in again.": "আপনার লগইনের মেয়াদ শেষ। আবার লগইন করুন।", "Expense added": "খরচ যোগ হয়েছে", "Days added": "দিন যোগ হয়েছে",
  "Payment approved": "পেমেন্ট অনুমোদিত হয়েছে", "Payment rejected": "পেমেন্ট বাতিল হয়েছে", "Shop suspended": "দোকান বন্ধ করা হয়েছে", "Shop restored": "দোকান আবার চালু হয়েছে",
  "Email confirmed": "ইমেইল নিশ্চিত হয়েছে", "Settings saved": "সেটিংস সেভ হয়েছে", "Not saved to the server yet. It will retry automatically.": "এখনো সার্ভারে সেভ হয়নি। নিজে থেকে আবার চেষ্টা করবে।",
  "Choose an image file (JPG, PNG or WebP).": "একটি ছবির ফাইল বাছুন (JPG, PNG বা WebP)।",

  // ---- questions
  "Delete this record?": "এই রেকর্ডটি মুছবেন?", "Delete this currency?": "এই মুদ্রাটি মুছবেন?", "Delete this note?": "এই নোটটি মুছবেন?", "Delete this role?": "এই রোলটি মুছবেন?",
  "Approve this payment? Make sure the money has arrived.": "এই পেমেন্ট অনুমোদন করবেন? আগে নিশ্চিত হোন টাকা এসেছে।",
  "Mark this owner's email as confirmed without the link?": "লিংক ছাড়াই এই মালিকের ইমেইল নিশ্চিত হিসেবে চিহ্নিত করবেন?",
  "Put the shop back to this backup? Everything changed after it will be undone. A copy of the shop as it is now is saved first.":
    "দোকানকে এই ব্যাকআপে ফিরিয়ে নেবেন? এর পরের সব পরিবর্তন বাতিল হয়ে যাবে। তার আগে এখনকার অবস্থার একটি কপি সেভ করা হবে।",
  "Some changes have not reached the server yet. Logging out now will discard them. Log out anyway?":
    "কিছু পরিবর্তন এখনো সার্ভারে পৌঁছায়নি। এখন লগ আউট করলে সেগুলো হারিয়ে যাবে। তবুও লগ আউট করবেন?",
  "Suspend this shop? Nobody in it will be able to save anything.": "এই দোকান বন্ধ করবেন? এর কেউ আর কিছু সেভ করতে পারবে না।",
  "Restore this shop?": "এই দোকান আবার চালু করবেন?", "Reason shown to the shop owner (optional):": "দোকানের মালিককে যে কারণ দেখানো হবে (ঐচ্ছিক):",
};

// Words that may be translated even inside a table cell, where most text is the shop's own data.
const cellWords = new Set(["Good", "Thin, may not scan", "Does not fit","No data yet", "No data found", "No products found", "No product found", "Active", "Inactive", "Paid", "Due", "Returned", "Yes", "No", "No image", "Cash", "Card", "Daily backup", "Saved before a restore",
  "approved", "rejected", "pending", "monthly", "yearly", "Waiting for approval", "Lifetime", "Expired", "Suspended", "Email not confirmed", "Walk-in Customer"]);

const digits = (value: string | number) => String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[+digit]);

// Text with a number or a name in it.
const patterns: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Showing (\d+) to (\d+) of (\d+) (entries|products)$/, (m) => `${m[3]}টির মধ্যে ${m[1]} থেকে ${m[2]} দেখানো হচ্ছে`],
  [/^Show- (\d+)$/, (m) => `${m[1]}টি দেখান`],
  [/^(\d+) Days$/, (m) => `${digits(m[1])} দিন`],
  [/^(\d+) days left$/, (m) => `${digits(m[1])} দিন বাকি`],
  [/^Trial · (\d+) days left$/, (m) => `ট্রায়াল · ${digits(m[1])} দিন বাকি`],
  [/^Paid · (\d+) days left$/, (m) => `চালু · ${digits(m[1])} দিন বাকি`],
  [/^You are on the free trial\. (\d+) days left\.$/, (m) => `আপনি ফ্রি ট্রায়ালে আছেন। ${digits(m[1])} দিন বাকি।`],
  [/^Your subscription is paid\. (\d+) days left\.$/, (m) => `আপনার সাবস্ক্রিপশন চালু আছে। ${digits(m[1])} দিন বাকি।`],
  [/^(Free trial|Subscription): (\d+) days left\. Tap here to pay and keep your shop running\.$/, (m) => `${m[1] === "Free trial" ? "ফ্রি ট্রায়াল" : "সাবস্ক্রিপশন"}: ${digits(m[2])} দিন বাকি। দোকান চালু রাখতে এখানে চেপে টাকা দিন।`],
  [/^Please confirm your email: we sent a link to (.+)\.$/, (m) => `আপনার ইমেইল নিশ্চিত করুন: ${m[1]} ঠিকানায় একটি লিংক পাঠিয়েছি।`],
  [/^Registration Date: (.+)$/, (m) => `রেজিস্ট্রেশনের তারিখ: ${m[1] === "Not available" ? "জানা নেই" : m[1]}`],
  [/^Plan Expire Date: (.+)$/, (m) => `প্ল্যানের মেয়াদ শেষ: ${m[1] === "Not set" ? "নির্ধারিত নয়" : m[1]}`],
  [/^Low Stock \((\d+)\)$/, (m) => `কম স্টক (${m[1]})`],
  [/^Customer Due \((\d+)\)$/, (m) => `গ্রাহকের বাকি (${m[1]})`],
  [/^(Out of stock|Stock (-?[\d.]+)) · Alert Qty ([\d.]+)$/, (m) => `${m[2] === undefined ? "স্টক শেষ" : `স্টক ${m[2]}`} · সতর্কতার পরিমাণ ${m[3]}`],
  [/^Low stock: (.+)$/, (m) => `কম স্টক: ${m[1]}`],
  [/^(\d+) products are left out because their code is empty or has letters a barcode cannot hold\. Give them a code using English letters and digits\.$/, (m) => `${m[1]}টি পণ্য বাদ পড়েছে, কারণ তাদের কোড খালি অথবা এমন অক্ষর আছে যা বারকোডে রাখা যায় না। ইংরেজি অক্ষর ও সংখ্যা দিয়ে কোড দিন।`],
  [/^In the printer's own settings, set the paper size to ([\d.]+) × ([\d.]+) mm and the margins to none, and print at 100% scale\.$/, (m) => `প্রিন্টারের নিজের সেটিংসে কাগজের মাপ ${m[1]} × ${m[2]} মিমি দিন, মার্জিন শূন্য রাখুন, আর ১০০% স্কেলে ছাপুন।`],
  [/^The text and barcode need about (\d+) mm but the label is ([\d.]+) mm high, so part of it will be cut off\. Make the barcode or text smaller, or hide a line\.$/, (m) => `লেখা ও বারকোডের জন্য প্রায় ${m[1]} মিমি লাগে, কিন্তু লেবেলের উচ্চতা ${m[2]} মিমি, তাই কিছু অংশ কেটে যাবে। বারকোড বা লেখা ছোট করুন, অথবা একটি লাইন বাদ দিন।`],
  [/^These labels need ([\d.]+) mm across, but an A4 sheet has (\d+) mm\. Use fewer labels per row or a smaller width\.$/, (m) => `এই লেবেলগুলোর জন্য ${m[1]} মিমি চওড়া লাগবে, কিন্তু A4 কাগজে আছে ${m[2]} মিমি। প্রতি সারিতে লেবেল কমান অথবা চওড়া ছোট করুন।`],
  [/^Showing the first 60 of (\d+) labels\. All of them are printed\.$/, (m) => `${m[1]}টি লেবেলের প্রথম ৬০টি দেখানো হচ্ছে। প্রিন্টে সবগুলোই আসবে।`],
  [/^Total stock value: (.+)$/, (m) => `স্টকের মোট মূল্য: ${m[1]}`],
  [/^Overall Reports (\d{4})$/, (m) => `সার্বিক রিপোর্ট ${m[1]}`],
  [/^Revenue Statistic (\d{4})$/, (m) => `আয়ের পরিসংখ্যান ${m[1]}`],
  [/^This image is (.+)\. Choose one smaller than (\d+) KB\.$/, (m) => `এই ছবিটি ${m[1]}। ${m[2]} KB-এর ছোট একটি ছবি বাছুন।`],
  [/^Add (\d+) days to this shop\?$/, (m) => `এই দোকানে ${m[1]} দিন যোগ করবেন?`],
  [/^Send Money for the plan you chose to:$/, () => "যে প্ল্যান বেছেছেন তার টাকা Send Money করুন এই নম্বরে:"],
  [/^The payment number has not been set up yet\. Need help\? Call (.+)\.$/, (m) => `টাকা পাঠানোর নম্বর এখনো বসানো হয়নি। সাহায্য লাগলে ফোন করুন: ${m[1]}।`],
  [/^Need help\? Call (.+)\.$/, (m) => `সাহায্য লাগলে ফোন করুন: ${m[1]}।`],
];

/** The Bangla for a piece of interface text, or the text unchanged when there is none. */
export function translate(text: string, inCell = false): string {
  const whole = text.replace(/\s+/g, " ").trim();
  if (!whole) return text;
  const lookup = (value: string) => (!inCell || cellWords.has(value) ? words[value] : undefined);
  let result = lookup(whole);
  if (result === undefined) {
    // Labels often carry a leading icon or "+ " and a trailing colon or star: translate what is between.
    const parts = /^([^A-Za-z]*)(.*?)([\s:*›…]*)$/.exec(whole);
    if (parts && parts[2] !== whole && lookup(parts[2]) !== undefined) result = parts[1] + lookup(parts[2]) + parts[3];
  }
  if (result === undefined && !inCell) {
    // "Product saved", "Customer saved"...: the screens build these from the list's own name.
    const saved = /^(.+) saved$/.exec(whole);
    if (saved && words[saved[1]]) result = `${words[saved[1]]} সেভ হয়েছে`;
    for (const [pattern, build] of patterns) {
      const match = result === undefined ? pattern.exec(whole) : null;
      if (match) result = build(match);
    }
  }
  if (result === undefined) return text;
  // Keep the spacing the original had around it.
  return text.replace(/^(\s*)[\s\S]*?(\s*)$/, (_all, before: string, after: string) => before + result + after);
}

const ATTRIBUTES = ["placeholder", "title", "aria-label"];

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest("style, script, textarea, [data-no-translate]")) return;
    const original = node.nodeValue || "";
    const next = translate(original, parent.tagName === "TD");
    if (next !== original) node.nodeValue = next;
    return;
  }
  if (!(node instanceof Element)) return;
  for (const element of [node, ...node.querySelectorAll("[placeholder], [title], [aria-label]")]) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) {
        const next = translate(value);
        if (next !== value) element.setAttribute(name, next);
      }
    }
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let text: Node | null;
  while ((text = walker.nextNode())) translateNode(text);
}

/** Starts showing the page in Bangla, if that is the chosen language. Call once at startup. */
export function startTranslating(root: HTMLElement) {
  if (currentLanguage() !== "bn") return;
  document.documentElement.lang = "bn";
  translateNode(root);
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === "characterData") translateNode(change.target);
      else if (change.type === "attributes") translateNode(change.target);
      else change.addedNodes.forEach(translateNode);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });

  // Questions the browser asks in its own box are not part of the page.
  const ask = window.confirm.bind(window);
  window.confirm = (message?: string) => ask(translate(message || ""));
  const request = window.prompt.bind(window);
  window.prompt = (message?: string, value?: string) => request(translate(message || ""), value);
}
