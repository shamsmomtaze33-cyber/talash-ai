/**
 * Detects whether a message is written primarily in Pashto (Perso-Arabic script)
 * so UI alignment and text direction can switch cleanly between RTL (Pashto)
 * and LTR (English or other languages).
 */
export function isPashtoText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Pashto-specific Perso-Arabic letters (ټ, څ, ځ, ډ, ړ, ږ, ښ, ګ, ڼ, ې, ۍ, ی)
  const pashtoSpecificRegex =
    /[\u067C\u0681\u0685\u0689\u0693\u0696\u069A\u06AB\u06BC\u06CD\u06D0\u06CC]/;

  const arabicScriptMatches = trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
  if (!arabicScriptMatches || arabicScriptMatches.length === 0) {
    return false;
  }

  if (pashtoSpecificRegex.test(trimmed)) {
    return true;
  }

  const latinMatches = trimmed.match(/[A-Za-z]/g);
  return arabicScriptMatches.length >= (latinMatches?.length ?? 0);
}
