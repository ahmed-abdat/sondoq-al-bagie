// Synthetic OCR outputs shaped like the benchmark receipts (docs/research/receipt-ocr). All
// numbers and names are fictional; real receipts never enter the repo.

export const ACCOUNTS = [
  { method: "bankily", accountNumber: "22000001", holderName: "Rabitat Albaqie" },
  { method: "sedad", accountNumber: "22000003", holderName: "Sidi Mohamed" },
  { method: "masrvi", accountNumber: "22000002", holderName: "Rabitat Albaqie" },
];

export const BANKILY = `النقل ناجح
المرسل : 100.00 MRU
المستفيد : 22000001
معرف المعاملة : 0926092814484388261
26-09-28 14:48:45`;

/** Arabic-Indic digits and direction marks, as some phones produce. */
export const BANKILY_ARABIC_DIGITS = `‏النقل ناجح
المرسل : ١٠٠٫٠٠ MRU
المستفيد : ٢٢٠٠٠٠٠١
معرف المعاملة : ٠٩٢٦٠٩٢٨١٤٤٨٤٣٨٨٢٦١
٢٦-٠٩-٢٨ ١٤:٤٨:٤٥`;

/** OCR read the zero after TR as the letter O. */
export const SEDAD = `SEDAD
لقد قمت بإرسال 1.500,00 أوقية إلى Sidi Mohamed
رقم الهاتف 22000003
رقم المعاملة TRO7258252750
11/09/2026 17:54:42`;

export const MASRVI = `Masrvi
MRU 500.00 (Frais 0.00)
Rabitat Albaqie
المرجع 266837993
03-09-2026 10:15:55
Terminer`;

/** A first pass that went wrong on a dark screenshot: digits dropped, amount lost. */
export const MASRVI_BAD_FIRST_PASS = `Masrvi
MRU
Rabltat A1baqie
المرجع 26683799
03-09-2026 10:15:55`;

export const NOT_A_RECEIPT = `مرحبا كيف الحال
صورة من المعرض`;
