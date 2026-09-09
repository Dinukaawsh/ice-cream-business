import { BRAND_LOGO_SRC, BRAND_NAME } from "@/lib/brand";

type BrandMarkProps = {
  size?: number;
  showName?: boolean;
};

export function BrandMark({ size = 40, showName = true }: BrandMarkProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={BRAND_LOGO_SRC}
        alt={`${BRAND_NAME} logo`}
        width={size}
        height={size}
        className="rounded-2xl shadow-md shadow-blue-200/60"
      />
      {showName ? (
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--ice-primary)]">
          {BRAND_NAME}
        </p>
      ) : null}
    </div>
  );
}
