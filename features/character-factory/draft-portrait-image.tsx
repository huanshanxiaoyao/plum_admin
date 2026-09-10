"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import styles from "./factory.module.css";

export function DraftPortraitImage({
  src,
  displayName,
  emptyLabel,
}: {
  readonly src: string | null;
  readonly displayName: string;
  readonly emptyLabel: string;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const failed = Boolean(src) && failedSrc === src;

  if (failed) {
    return <div className={styles.portraitPlaceholder} role="status">
      <ImageOff size={22} />
      <small>图片加载失败</small>
    </div>;
  }

  if (!src) {
    return <div className={styles.portraitPlaceholder}>
      <span>{displayName.slice(0, 1)}</span>
      <small>{emptyLabel}</small>
    </div>;
  }

  return <Image
    src={src}
    alt={`${displayName} 立绘`}
    fill
    sizes="260px"
    unoptimized
    onError={() => setFailedSrc(src)}
  />;
}
