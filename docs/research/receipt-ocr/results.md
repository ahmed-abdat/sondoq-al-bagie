# Receipt OCR test — 2026-09-28

Engine: Tesseract.js v5, `ara+eng` (best_int), no preprocessing. Parser: `parse.js` (per-wallet label rules). Runs ~0.6–1.1 s per image on a server CPU; expect 2–4 s on a phone.

| Receipt | App | Amount | Ref | Date | Recipient |
|---|---|---|---|---|---|
| Bankily popup | ✓ | ✓ 100 MRU | ✓ 19 digits | ✓ (YY-MM-DD) | ✓ phone 8 digits |
| Sedad Bank | ✓ | ✓ 1.500,00 → 1500 | ✓ after O→0 fix (TRO…→TR0…) | ✓ (DD-MM-YYYY) | ✓ phone + name |
| Masrvi Android | ✓ | ✓ MRU 500.00 | ✓ 9 digits | ✓ (DD/MM/YYYY) | name only, noisy ("TFeil") → token match OK |
| Masrvi iOS | ✓ | ✓ MRU 100.00 | ✓ 9 digits | ✓ | name only, split over lines, "El" lost → 4/5 name tokens |

Core fields (app, amount, ref, date): 16/16. Recipient phone: 2/2. Recipient name: verifiable by token matching, not by exact text.

Pitfalls:
- Sedad writes "أوقية" with no MRU label; assumed new ouguiya (×10 for old). Needs confirmation.
- Number formats differ: `1.500,00` (Sedad), `500.00` (Masrvi popup), `500,00` (Masrvi background). Rule: the last separator followed by exactly 2 digits is the decimal mark.
- Masrvi shows sent amount and "total incl. fees"; take the sent amount.
- Masrvi shows the recipient's name only, so checking "sent to the fund" needs the fund's account holder name per wallet; Bankily/Sedad show the phone number.
- OCR letter/digit confusion (O vs 0) in alphanumeric refs; normalise after the 2-letter prefix.
- Date orders differ: Bankily YY-MM-DD, Sedad DD-MM-YYYY, Masrvi DD/MM/YYYY.
- Background text in Masrvi screenshots (the card behind the popup) leaks into OCR; rules must anchor on labels, not "first number".
