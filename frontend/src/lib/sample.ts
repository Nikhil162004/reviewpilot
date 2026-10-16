/** Demo payloads so anyone can try the product without setup. */

export const SAMPLE_CODE = `import pickle
import hashlib
import requests

API_KEY = "[SECURITY_DATA]"
DATABASE_PASSWORD = "admin@12345"

def get_user(cursor, user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    cursor.execute(query)
    return cursor.fetchone()

def load_session(data):
    return pickle.loads(data)

def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()

def fetch(url):
    return requests.get(url, verify=False)

def add_item(item, items=[]):
    items.append(item)
    return items

def process_orders(orders, db):
    results = []
    for order in orders:
        for item in order.items:
            print("processing", item)
            db.execute("SELECT price FROM items WHERE id = %s" % item.id)
            results += str(item)
    return results

def parse(data):
    try:
        return eval(data)
    except:
        pass
`;

export const SAMPLE_DIFF = `diff --git a/payments.py b/payments.py
--- a/payments.py
+++ b/payments.py
@@ -1,4 +1,12 @@
 import requests
+import hashlib
+
+STRIPE_SECRET = "[SECURITY_DATA]"
+
+def charge(cursor, order_id):
+    cursor.execute(f"SELECT * FROM orders WHERE id = {order_id}")
+    return requests.post("https://api.example.com/charge", verify=False)
+
 def health():
     return "ok"
`;
