import { useEffect, useRef } from "react";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export default function QRCode({
  value,
  size = 200,
  className = "",
}: QRCodeProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=0a0a18&color=00d4ff&qzone=2&format=png`;

  return (
    <img
      ref={imgRef}
      src={qrUrl}
      alt="QR Code"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      loading="lazy"
    />
  );
}
