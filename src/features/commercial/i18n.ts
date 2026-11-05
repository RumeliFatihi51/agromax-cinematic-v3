export type Locale = "tr" | "en";
export function choose(locale: Locale, tr: string, en: string) {
  return locale === "tr" ? tr : en;
}
export function moneyMinor(input: string, locale: Locale): number {
  const text = input.trim();
  const valid =
    locale === "tr"
      ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
      : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!valid.test(text))
    throw new Error(
      choose(
        locale,
        "Tutarı 123,45 biçiminde girin.",
        "Enter an amount such as 123.45.",
      ),
    );
  const normalized =
    locale === "tr"
      ? text.replaceAll(".", "").replace(",", ".")
      : text.replaceAll(",", "");
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(choose(locale, "Tutar geçersiz.", "Invalid amount."));
  return Number(minor);
}
export function displayMoney(
  amountMinor: number,
  currency: string,
  locale: Locale,
) {
  return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
