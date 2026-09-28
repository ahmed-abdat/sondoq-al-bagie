import Image from "next/image";

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.jpg"
        alt="شعار رابطة شباب قرية البقيع"
        width={48}
        height={48}
        className="ring-gold/40 rounded-full ring-2"
        priority
      />
      <div>
        <p className="font-display text-lg leading-tight font-bold">صندوق الشباب</p>
        {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
      </div>
    </div>
  );
}
