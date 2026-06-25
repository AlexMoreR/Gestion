type GuaranteeBadgeProps = {
  className?: string;
};

// Sello circular "GARANTIA 1 AÑO DE FABRICA" dibujado en SVG (texto curvo + numero central).
export function GuaranteeBadge({ className }: GuaranteeBadgeProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Garantia 1 año de fabrica">
      <defs>
        <path id="guarantee-top-arc" d="M 19,50 A 31,31 0 0 1 81,50" fill="none" />
        <path id="guarantee-bottom-arc" d="M 13,51 A 37,37 0 0 0 87,51" fill="none" />
      </defs>

      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="1" />

      {/* Lineas decorativas a los lados */}
      <line x1="13" y1="50" x2="22" y2="50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="78" y1="50" x2="87" y2="50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      <text
        fill="currentColor"
        fontSize="12.5"
        fontWeight="700"
        letterSpacing="1.5"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-sans, sans-serif)" }}
      >
        <textPath href="#guarantee-top-arc" startOffset="50%">
          GARANTIA
        </textPath>
      </text>

      <text
        fill="currentColor"
        fontSize="11.5"
        fontWeight="700"
        letterSpacing="1.5"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-sans, sans-serif)" }}
      >
        <textPath href="#guarantee-bottom-arc" startOffset="50%">
          DE FABRICA
        </textPath>
      </text>

      <text
        x="50"
        y="60"
        fill="currentColor"
        fontSize="40"
        fontWeight="800"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-sans, sans-serif)" }}
      >
        1
      </text>
      <text
        x="50"
        y="73"
        fill="currentColor"
        fontSize="11"
        fontWeight="700"
        letterSpacing="1"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-sans, sans-serif)" }}
      >
        AÑO
      </text>
    </svg>
  );
}
