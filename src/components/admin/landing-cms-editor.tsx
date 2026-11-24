import { useCallback, useRef, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

const IMAGE_KEY_RE = /(image|logo|img|photo|icon|avatar|cover|bg|background|src|thumbnail|picture|screenshot)$/i;
const LONG_KEY_RE = /(description|body|content|subtitle|tagline|message|answer|details|text|caption)$/i;

function isImageKey(key: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (IMAGE_KEY_RE.test(key)) return true;
  return /^https?:\/\/.*\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(value);
}

function isLongTextKey(key: string, value: string) {
  return LONG_KEY_RE.test(key) || value.length > 80 || value.includes("\n");
}

function humanize(key: string) {
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ImageFieldProps {
  value: string;
  onChange: (v: string) => void;
}

function ImageField({ value, onChange }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `landing/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("landing-cms")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (error) throw error;
        const data = { publicUrl: `/api/public/media/landing-cms/${path}` };
        onChange(data.publicUrl);
        toast.success("Image uploaded");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted/30 flex items-center justify-center">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
          {uploading && (
            <div className="absolute inset-0 grid place-items-center bg-background/80">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Input
            value={value ?? ""}
            placeholder="https://... or upload"
            onChange={(e) => onChange(e.target.value)}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Upload
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  path: string[];
  fieldKey: string;
  value: JsonValue;
  onChange: (v: JsonValue) => void;
  onRemove?: () => void;
  depth?: number;
}

function Field({ path, fieldKey, value, onChange, onRemove, depth = 0 }: FieldProps) {
  const label = humanize(fieldKey);
  const id = `${path.join(".")}.${fieldKey}`;

  // Image string
  if (isImageKey(fieldKey, value)) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        <ImageField value={(value as string) ?? ""} onChange={(v) => onChange(v)} />
      </div>
    );
  }

  if (typeof value === "string") {
    const long = isLongTextKey(fieldKey, value);
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        {long ? (
          <Textarea
            id={id}
            value={value}
            rows={Math.min(8, Math.max(2, value.split("\n").length + 1))}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        <Switch id={id} checked={value} onCheckedChange={(v) => onChange(v)} />
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <ArrayField
        path={[...path, fieldKey]}
        label={label}
        value={value as JsonValue[]}
        onChange={(v) => onChange(v)}
        onRemove={onRemove}
        depth={depth}
      />
    );
  }

  if (value && typeof value === "object") {
    return (
      <ObjectField
        path={[...path, fieldKey]}
        label={label}
        value={value as { [k: string]: JsonValue }}
        onChange={(v) => onChange(v)}
        onRemove={onRemove}
        depth={depth}
      />
    );
  }

  // null / undefined
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Input value="" placeholder="(empty)" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface ObjectFieldProps {
  path: string[];
  label: string;
  value: { [k: string]: JsonValue };
  onChange: (v: { [k: string]: JsonValue }) => void;
  onRemove?: () => void;
  depth: number;
  collapsedDefault?: boolean;
}

function ObjectField({ path, label, value, onChange, onRemove, depth, collapsedDefault }: ObjectFieldProps) {
  const [open, setOpen] = useState(!collapsedDefault && depth < 1);
  const keys = Object.keys(value);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        depth > 0 && "bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm font-semibold"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
          <span className="text-xs font-normal text-muted-foreground">({keys.length})</span>
        </button>
        {onRemove && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="space-y-4 p-3">
          {keys.length === 0 && <p className="text-xs text-muted-foreground">No fields.</p>}
          {keys.map((k) => (
            <Field
              key={k}
              path={path}
              fieldKey={k}
              value={value[k]}
              onChange={(nv) => onChange({ ...value, [k]: nv })}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ArrayFieldProps {
  path: string[];
  label: string;
  value: JsonValue[];
  onChange: (v: JsonValue[]) => void;
  onRemove?: () => void;
  depth: number;
}

function ArrayField({ path, label, value, onChange, onRemove, depth }: ArrayFieldProps) {
  const sample = value[0];
  const addItem = () => {
    let next: JsonValue;
    if (typeof sample === "string") next = "";
    else if (typeof sample === "number") next = 0;
    else if (typeof sample === "boolean") next = false;
    else if (Array.isArray(sample)) next = [];
    else if (sample && typeof sample === "object") {
      next = Object.fromEntries(
        Object.keys(sample).map((k) => {
          const v = (sample as Record<string, JsonValue>)[k];
          if (typeof v === "string") return [k, ""];
          if (typeof v === "number") return [k, 0];
          if (typeof v === "boolean") return [k, false];
          if (Array.isArray(v)) return [k, []];
          if (v && typeof v === "object") return [k, {}];
          return [k, ""];
        }),
      ) as JsonValue;
    } else next = "";
    onChange([...value, next]);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          <span className="text-xs font-normal text-muted-foreground">({value.length})</span>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
          {onRemove && (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-3 p-3">
        {value.length === 0 && <p className="text-xs text-muted-foreground">No items. Click Add.</p>}
        {value.map((item, i) => (
          <div key={i} className="rounded-md border bg-background p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...value];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    onChange(next);
                  }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={i === value.length - 1}
                  onClick={() => {
                    const next = [...value];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    onChange(next);
                  }}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Field
              path={[...path, String(i)]}
              fieldKey={`item`}
              value={item}
              onChange={(v) => {
                const next = [...value];
                next[i] = v;
                onChange(next);
              }}
              depth={depth + 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface LandingCmsEditorProps {
  section: string;
  value: JsonValue;
  onChange: (v: JsonValue) => void;
}

export function LandingCmsEditor({ section, value, onChange }: LandingCmsEditorProps) {
  if (value === null || value === undefined) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        This section is empty. Save once to initialize it.
      </div>
    );
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return (
      <Field
        path={[]}
        fieldKey={section}
        value={value}
        onChange={(v) => onChange(v)}
      />
    );
  }
  return (
    <ObjectField
      path={[]}
      label={humanize(section)}
      value={value as { [k: string]: JsonValue }}
      onChange={(v) => onChange(v)}
      depth={0}
    />
  );
}
