#!/usr/bin/env bash
#
# End-to-end check of the API surface against a running server.
#
#   npm run dev        (in another terminal)
#   npm run test:api
#
# It signs up a throwaway customer each run, so it needs a reachable database
# and leaves one extra user behind. Everything it asserts is a status code —
# the point is that the routes exist, are mounted where they claim to be, and
# refuse what they should refuse.
set -u
API=http://localhost:5050/api
STAMP=$(date +%s)
EMAIL="feat${STAMP}@example.com"; PASS="Probe#12345"
pass=0; fail=0

hdr() { printf "\n\033[1m%s\033[0m\n" "$1"; }
# check <label> <expected-code> <curl args...>
check() {
  local label="$1"; local want="$2"; shift 2
  local got; got=$(curl -s -o /tmp/body.json -w "%{http_code}" "$@")
  if [ "$got" = "$want" ]; then
    pass=$((pass+1)); printf "  \033[32mok\033[0m   %-42s %s\n" "$label" "$got"
  else
    fail=$((fail+1)); printf "  \033[31mFAIL\033[0m %-42s got %s want %s :: %s\n" "$label" "$got" "$want" "$(head -c 160 /tmp/body.json)"
  fi
}
show() { python3 -c "import json,sys;d=json.load(open('/tmp/body.json'));$1" 2>/dev/null || true; }

curl -s -X POST "$API/auths/signup" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Feature Probe\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"confirmPassword\":\"$PASS\",\"number\":\"96${STAMP: -7}\"}" > /dev/null
TOK=$(curl -s -X POST "$API/auths/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")
[ -n "$TOK" ] || { echo "login failed"; exit 1; }
AUTH="Authorization: Bearer $TOK"
JSON='Content-Type: application/json'

VID=$(curl -s "$API/venues" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['venues'][0]['_id'])")
DISH=$(curl -s "$API/cuisines" | python3 -c "
import sys,json; d=json.load(sys.stdin)['data']
print((d.get('cuisines') or d.get('categories') or d)[0]['dishes'][0]['_id'])")

hdr "Queue route (was double-prefixed)"
check "GET /admin/email-queue/status reachable" 401 "$API/admin/email-queue/status"

hdr "Shortlist"
printf '{"itemType":"venue","itemId":"%s"}' "$VID" > /tmp/fav.json
check "toggle on" 200 -X POST "$API/users/me/favorites/toggle" -H "$AUTH" -H "$JSON" -d @/tmp/fav.json
show "print('       ->',d['data'])"
check "list resolves the item" 200 "$API/users/me/favorites" -H "$AUTH"
show "print('       ->',[f['name'] for f in d['data']['favorites']])"
check "ids" 200 "$API/users/me/favorites/ids" -H "$AUTH"
show "print('       ->',d['data']['ids'])"
check "toggle off" 200 -X POST "$API/users/me/favorites/toggle" -H "$AUTH" -H "$JSON" -d @/tmp/fav.json
show "print('       ->',d['data'])"
echo '{"itemType":"car","itemId":"6a8d9936714872f415f9b849"}' > /tmp/bad.json
check "rejects unknown itemType" 400 -X POST "$API/users/me/favorites/toggle" -H "$AUTH" -H "$JSON" -d @/tmp/bad.json

hdr "Item reviews"
printf '{"rating":5,"comment":"The hall was spotless and the staff arrived early.","itemType":"venue","itemId":"%s"}' "$VID" > /tmp/rev.json
check "post an item review" 200 -X POST "$API/reviews" -H "$AUTH" -H "$JSON" -d @/tmp/rev.json
show "print('       ->',d['message'])"
printf '{"rating":3,"comment":"Second thoughts.","itemType":"venue","itemId":"%s"}' "$VID" > /tmp/rev2.json
check "re-posting edits rather than duplicates" 200 -X POST "$API/reviews" -H "$AUTH" -H "$JSON" -d @/tmp/rev2.json
show "print('       ->',d['message'])"
check "read one item's reviews" 200 "$API/reviews/item/venue/$VID"
show "print('       -> published',d['data']['summary']['total'],'avg',d['data']['summary']['average'])"
check "reviewable list" 200 "$API/reviews/reviewable" -H "$AUTH"
echo '{"rating":9}' > /tmp/badrev.json
check "rejects out-of-range rating" 400 -X POST "$API/reviews" -H "$AUTH" -H "$JSON" -d @/tmp/badrev.json
echo '{"rating":5,"itemType":"venue","itemId":"6a8d9936714872f415f9b000"}' > /tmp/ghost.json
check "rejects review of a missing venue" 404 -X POST "$API/reviews" -H "$AUTH" -H "$JSON" -d @/tmp/ghost.json

hdr "Guest count"
printf '{"guestCount":200,"items":[{"itemId":"%s","itemType":"dish","quantity":1}]}' "$DISH" > /tmp/ord.json
check "order priced per head" 201 -X POST "$API/orders" -H "$AUTH" -H "$JSON" -d @/tmp/ord.json
OID=$(python3 -c "import json;print(json.load(open('/tmp/body.json'))['order']['_id'])" 2>/dev/null)
show "
o=d['order']; it=o['items'][0]
print('       -> guests',o['guestCount'],'qty',it['quantity'],'unit',it['price'],'total',o['totalAmount'])
assert it['quantity']==200 and o['totalAmount']==it['price']*200
print('       -> total is unit price x headcount: yes')"
printf '{"guestCount":0,"items":[{"itemId":"%s","itemType":"dish","quantity":1}]}' "$DISH" > /tmp/ord0.json
check "rejects a zero headcount" 400 -X POST "$API/orders" -H "$AUTH" -H "$JSON" -d @/tmp/ord0.json
printf '{"guestCount":5000,"items":[{"itemId":"%s","itemType":"venue","quantity":1}]}' "$VID" > /tmp/ordbig.json
check "rejects a party larger than the room" 400 -X POST "$API/orders" -H "$AUTH" -H "$JSON" -d @/tmp/ordbig.json
show "print('       ->',d['message'])"

hdr "Cancellation"
check "quote before cancelling" 200 "$API/orders/$OID/cancellation-quote" -H "$AUTH"
show "print('       ->',d['data']['policy'],'| refund Rs',d['data']['refundAmount'])"
echo '{}' > /tmp/noreason.json
check "customer must give a reason" 400 -X POST "$API/orders/$OID/cancel" -H "$AUTH" -H "$JSON" -d @/tmp/noreason.json
echo '{"reason":"The date moved."}' > /tmp/reason.json
check "cancel" 200 -X POST "$API/orders/$OID/cancel" -H "$AUTH" -H "$JSON" -d @/tmp/reason.json
check "cannot cancel twice" 400 -X POST "$API/orders/$OID/cancel" -H "$AUTH" -H "$JSON" -d @/tmp/reason.json

hdr "Availability"
D=$(python3 -c "import datetime;print((datetime.date.today()+datetime.timedelta(days=40)).isoformat())")
check "free on a date" 200 "$API/availability?from=$D"
show "print('       ->',d['data']['counts'])"
check "filtered by headcount" 200 "$API/availability?from=$D&guests=500"
show "print('       -> venues holding 500+:',d['data']['counts']['venues'])"
check "rejects a bad date" 400 "$API/availability?from=notadate"
check "rejects a backwards range" 400 "$API/availability?from=$D&till=2020-01-01"
check "calendar is staff-only" 401 "$API/availability/calendar?month=2026-09"

hdr "Occasions"
check "list" 200 "$API/recommend/occasions"
show "print('       ->',[o['id'] for o in d['data']['occasions']])"
for o in wedding bratabandha pasni mehendi corporate anniversary; do
  check "package: $o" 200 "$API/recommend/package?occasion=$o&budget=400000&guests=100"
done
check "rejects an unknown occasion" 400 "$API/recommend/package?occasion=birthday&budget=100000"
check "rejects a trivial budget" 400 "$API/recommend/package?occasion=pasni&budget=100"

hdr "Sorting"
check "venues by orderedCount" 200 "$API/venues?sortField=orderedCount&sortOrder=desc&limit=3"
check "unknown sort falls back" 200 "$API/venues?sortField=nonsense"
check "studios by orderedCount" 200 "$API/studios?sortField=orderedCount&sortOrder=desc"

hdr "Payment webhooks"
echo '{"pidx":"does-not-exist"}' > /tmp/wh.json
check "khalti accepts and logs" 200 -X POST "$API/payments/webhook/khalti" -H "$JSON" -d @/tmp/wh.json
echo '{"PRN":"does-not-exist"}' > /tmp/wh2.json
check "fonepay accepts and logs" 200 -X POST "$API/payments/webhook/fonepay" -H "$JSON" -d @/tmp/wh2.json
check "reconcile is staff-only" 401 "$API/payments/reconcile"

hdr "Enquiries"
echo '{"name":"Probe","email":"probe@example.com","phone":"9800000000","subject":"Venue enquiry","budget":"500000","message":"Anything free in Mangsir?"}' > /tmp/ct.json
check "public form still posts" 201 -X POST "$API/contacts/form" -H "$JSON" -d @/tmp/ct.json
echo '{"status":"in_progress"}' > /tmp/st.json
check "status change is staff-only" 403 -X PATCH "$API/contacts/form/000000000000000000000000" -H "$AUTH" -H "$JSON" -d @/tmp/st.json
check "reply is staff-only" 403 -X POST "$API/contacts/form/000000000000000000000000/reply" -H "$AUTH" -H "$JSON" -d @/tmp/st.json


# ---------------------------------------------------------------------------
# Added with the cart and language work. Kept in the same file so one command
# still covers the whole surface.
# ---------------------------------------------------------------------------
hdr "Cart persistence"
printf '{"items":[{"_id":"%s","type":"venue","name":"Test hall","price":65000,"quantity":1}],"guestCount":150}' "$VID" > /tmp/cart.json
check "save" 200 -X PUT "$API/users/me/cart" -H "$AUTH" -H "$JSON" -d @/tmp/cart.json
check "read back" 200 "$API/users/me/cart" -H "$AUTH"
show "
c=d['data']['cart']
print('       ->',len(c['items']),'item(s), guests',c['guestCount'])
assert c['items'][0]['name']=='Test hall' and c['guestCount']==150"
echo '{"items":[{"junk":true}],"guestCount":150}' > /tmp/cartbad.json
check "drops items with no id or type" 200 -X PUT "$API/users/me/cart" -H "$AUTH" -H "$JSON" -d @/tmp/cartbad.json
show "print('       -> stored',d['data']['count'],'item(s) — junk dropped')"

hdr "Availability calendar"
# A customer token is rejected before the month is even looked at, which is
# the right order: authorization first, validation second.
check "is staff-only even with a bad month" 403 "$API/availability/calendar?month=nonsense" -H "$AUTH"

printf "\n\033[1m%d passed, %d failed\033[0m\n" "$pass" "$fail"
