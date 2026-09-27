import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

export function CanvasImageWithFallback({ src, alt, className }: { src?: string; alt: string; className?: string }) {
    const [failedSrc, setFailedSrc] = useState<string | undefined>();
    if (!src || failedSrc === src) return <ImageIcon className="size-4 opacity-65" aria-label={alt} />;
    return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} className={className} />;
}
