"use client";

import { ClipboardCopy, Eye, EyeOff, FileCode2, FileUp, List, Plus } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type EditorMode = "table" | "env";

/** Table / .env switch, the count, and the actions for every variable. */
export function EnvToolbar({
  mode,
  onModeChange,
  count,
  canEdit,
  allRevealed,
  onRevealAll,
  onCopyAll,
  onImportFile,
  onAdd,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  count: number;
  canEdit: boolean;
  allRevealed: boolean;
  onRevealAll: () => void;
  onCopyAll: () => void;
  onImportFile: (file: File) => void;
  onAdd: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={mode} onValueChange={(value) => onModeChange(value === "env" ? "env" : "table")}>
        <TabsList aria-label="Editor view">
          <TabsTrigger value="table">
            <List /> Table
          </TabsTrigger>
          <TabsTrigger value="env">
            <FileCode2 /> .env
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="text-sm text-muted-foreground tabular-nums">
        {count} {count === 1 ? "variable" : "variables"}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {mode === "table" && count > 0 ? (
          <Button variant="ghost" size="sm" aria-pressed={allRevealed} onClick={onRevealAll}>
            {allRevealed ? <EyeOff /> : <Eye />} {allRevealed ? "Hide" : "Reveal"}
          </Button>
        ) : null}
        {count > 0 ? (
          <Button variant="ghost" size="sm" onClick={onCopyAll}>
            <ClipboardCopy /> Copy
          </Button>
        ) : null}
        {canEdit ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp /> Import
            </Button>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              aria-label="Import a .env file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) {
                  onImportFile(file);
                }
                event.target.value = "";
              }}
            />
          </>
        ) : null}
        {canEdit && mode === "table" ? (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus /> Add
          </Button>
        ) : null}
      </div>
    </div>
  );
}
