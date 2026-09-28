import Image from "next/image";

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.jpg"
        alt="شعار رابطة شباب قرية البقيع"
        width={48}
        height={48}
        className="rounded-full ring-2 ring-gold/40"
        priority
      />
      <div>
        <p className="font-display text-lg font-bold leading-tight">
          صندوق البقيع
        </p>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
