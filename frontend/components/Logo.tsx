// Logo Praktika: huruf P yang lengkungnya memuat tanda plus (kesehatan).
// Bentuk persegi tanpa sudut membulat, sama dengan sisa halaman.
// inverse: untuk di atas bidang biru (kotak warna kertas, huruf biru).
export function LogoMark({ size = 32, inverse = false }: { size?: number; inverse?: boolean }) {
  const box = inverse ? "var(--paper)" : "var(--accent)";
  const glyph = inverse ? "var(--accent)" : "#fff";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Praktika"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" fill={box} />
      <rect x="8" y="7" width="4" height="18" fill={glyph} />
      <circle cx="18" cy="13" r="6" fill={glyph} />
      <rect x="17" y="10" width="2" height="6" fill={box} />
      <rect x="15" y="12" width="6" height="2" fill={box} />
    </svg>
  );
}
