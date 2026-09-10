"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { characterFactoryRevisionImageUrl } from "./api";
import styles from "./factory.module.css";

type PreviewSide = "before" | "after";

function PreviewImage({
  candidateId,
  taskId,
  side,
  fixtureMode,
}: {
  readonly candidateId: string;
  readonly taskId: string;
  readonly side: PreviewSide;
  readonly fixtureMode: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const src = characterFactoryRevisionImageUrl(candidateId, taskId, side);
  const isBefore = side === "before";
  const failed = failedSrc === src;

  return <div className={styles.imageRevisionTile}>
    <small>{isBefore ? "修改前" : "修改后"}</small>
    <div className={styles.imageRevisionFrame}>
      {fixtureMode ? <div className={styles.imageRevisionPlaceholder}>
        <span>{isBefore ? "原图" : "新图"}</span>
      </div> : failed ? <div className={styles.imageRevisionPlaceholder} role="status">
        <ImageOff size={18} />
        <span>图片加载失败</span>
      </div> : <Image
        src={src}
        alt={isBefore ? "角色图片修改前预览" : "角色图片修改后预览"}
        fill
        sizes="(max-width: 700px) 42vw, 180px"
        unoptimized
        onError={() => setFailedSrc(src)}
      />}
    </div>
    <strong>{isBefore ? "当前角色图片" : "待应用的新图片"}</strong>
  </div>;
}

export function RevisionImageComparison({
  candidateId,
  taskId,
  fixtureMode,
}: {
  readonly candidateId: string;
  readonly taskId: string;
  readonly fixtureMode: boolean;
}) {
  return <div className={styles.imageRevisionSummary}>
    <PreviewImage candidateId={candidateId} taskId={taskId} side="before" fixtureMode={fixtureMode} />
    <PreviewImage candidateId={candidateId} taskId={taskId} side="after" fixtureMode={fixtureMode} />
  </div>;
}
