import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Users,
  GraduationCap,
  BookOpen,
  ChevronRight,
  X,
} from "lucide-react";
import { cn, formatTeacherName } from "@/lib/utils";

interface Student {
  id: string;
  profile: { name: string } | null;
  language: { name: string } | null;
  level: { name: string; code: string } | null;
  status: string;
}

interface Teacher {
  id: string;
  name: string;
  languages: string[];
}

interface Group {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (type: "student" | "teacher" | "group", id: string) => void;
  students: Student[];
  teachers: Teacher[];
  groups: Group[];
}

type ResultItem =
  | { kind: "student"; id: string; name: string; subtitle: string }
  | { kind: "teacher"; id: string; name: string; subtitle: string }
  | { kind: "group"; id: string; name: string; subtitle: string };

const MAX_PER_GROUP = 5;

function filterStudents(students: Student[], query: string): ResultItem[] {
  const q = query.toLowerCase();
  return students
    .filter((s) => s.profile?.name.toLowerCase().includes(q))
    .slice(0, MAX_PER_GROUP)
    .map((s) => {
      const lang = s.language?.name ?? "";
      const lvl = s.level?.code ?? "";
      const subtitle = [lang, lvl].filter(Boolean).join(" · ");
      return {
        kind: "student" as const,
        id: s.id,
        name: s.profile?.name ?? "",
        subtitle,
      };
    });
}

function filterTeachers(teachers: Teacher[], query: string): ResultItem[] {
  const q = query.toLowerCase();
  return teachers
    .filter((t) => t.name.toLowerCase().includes(q))
    .slice(0, MAX_PER_GROUP)
    .map((t) => ({
      kind: "teacher" as const,
      id: t.id,
      name: t.name,
      subtitle: t.languages.join(", "),
    }));
}

function filterGroups(groups: Group[], query: string): ResultItem[] {
  const q = query.toLowerCase();
  return groups
    .filter((g) => g.name.toLowerCase().includes(q))
    .slice(0, MAX_PER_GROUP)
    .map((g) => ({
      kind: "group" as const,
      id: g.id,
      name: g.name,
      subtitle: "Turma",
    }));
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  items: ResultItem[];
  activeIndex: number;
  globalOffset: number;
  onHover: (index: number) => void;
  onClick: (item: ResultItem) => void;
}

function ResultSection({
  title,
  icon,
  items,
  activeIndex,
  globalOffset,
  onHover,
  onClick,
}: SectionProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      {items.map((item, localIdx) => {
        const globalIdx = globalOffset + localIdx;
        const isActive = globalIdx === activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => onHover(globalIdx)}
            onClick={() => onClick(item)}
            className={cn(
              "group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
              isActive ? "bg-muted" : "hover:bg-muted/60"
            )}
          >
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-medium leading-tight">
                {item.kind === "teacher" ? formatTeacherName(item.name) : item.name}
              </span>
              {item.subtitle && (
                <span className="block truncate text-xs text-muted-foreground mt-0.5">
                  {item.subtitle}
                </span>
              )}
            </span>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-opacity",
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function AdminCommandPalette({
  open,
  onClose,
  onNavigate,
  students,
  teachers,
  groups,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!open) {
          // The parent controls open; we can't open it ourselves without a setter.
          // Signal the parent if they wire up the shortcut externally, or
          // expose via document event for convenience.
          document.dispatchEvent(new CustomEvent("adminpalette:open"));
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Focus input when opened, reset state when closed
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Small delay to let the portal mount before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const studentResults = filterStudents(students, query);
  const teacherResults = filterTeachers(teachers, query);
  const groupResults = filterGroups(groups, query);

  const teacherOffset = studentResults.length;
  const groupOffset = teacherOffset + teacherResults.length;
  const totalResults = groupOffset + groupResults.length;

  const flatResults: ResultItem[] = [
    ...studentResults,
    ...teacherResults,
    ...groupResults,
  ];

  const handleSelect = useCallback(
    (item: ResultItem) => {
      onNavigate(item.kind, item.id);
      onClose();
    },
    [onNavigate, onClose]
  );

  // Keyboard navigation inside modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(1, totalResults));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev === 0 ? Math.max(0, totalResults - 1) : prev - 1
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatResults[activeIndex];
        if (item) handleSelect(item);
        return;
      }
    },
    [totalResults, flatResults, activeIndex, handleSelect, onClose]
  );

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const hasResults = totalResults > 0;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="bg-background border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar alunos, professores ou turmas..."
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/60"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results / hints */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {!hasQuery && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Digite para buscar alunos, professores ou turmas...
            </p>
          )}

          {hasQuery && !hasResults && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado encontrado
            </p>
          )}

          {hasQuery && hasResults && (
            <>
              <ResultSection
                title="Alunos"
                icon={<Users className="h-3.5 w-3.5" />}
                items={studentResults}
                activeIndex={activeIndex}
                globalOffset={0}
                onHover={setActiveIndex}
                onClick={handleSelect}
              />
              <ResultSection
                title="Professores"
                icon={<GraduationCap className="h-3.5 w-3.5" />}
                items={teacherResults}
                activeIndex={activeIndex}
                globalOffset={teacherOffset}
                onHover={setActiveIndex}
                onClick={handleSelect}
              />
              <ResultSection
                title="Turmas"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                items={groupResults}
                activeIndex={activeIndex}
                globalOffset={groupOffset}
                onHover={setActiveIndex}
                onClick={handleSelect}
              />
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <kbd className="font-mono">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> abrir
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}
