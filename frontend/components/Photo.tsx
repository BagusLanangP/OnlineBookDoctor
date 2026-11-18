import Image from "next/image";

// Foto dengan satu perlakuan yang sama di seluruh halaman (duotone biru, lihat
// filter #duo di layout.tsx dan .photo di globals.css). Foto-foto ini suasana
// dari Unsplash, bukan foto klinik klien, jadi alt-nya hanya menyebut isi gambar.
export function Photo({
  src,
  alt,
  width,
  height,
  className = "",
  priority = false,
  sizes,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <span className={`photo ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
      />
    </span>
  );
}
