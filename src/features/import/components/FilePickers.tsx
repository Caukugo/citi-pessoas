import { useRef } from 'react';
import { FileSpreadsheet, FileArchive, X } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

/**
 * Escolha dos dois arquivos: a planilha e o .zip das fotos.
 *
 * O `<input type="file">` fica escondido e é acionado pelo `Button` do Design
 * System — o input nativo não aceita estilo e o projeto não tem componente de
 * upload. Escondido com `sr-only` e não `display:none`: assim ele continua
 * alcançável por leitor de tela e o rótulo continua associado.
 */

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileSlot({
  id,
  label,
  hint,
  accept,
  icon,
  file,
  disabled,
  onSelect,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-surface border border-border p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          onSelect(event.target.files?.[0] ?? null);
          // Zera o valor para que escolher O MESMO arquivo de novo (depois de
          // corrigi-lo fora) dispare o onChange outra vez.
          event.target.value = '';
        }}
      />

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-control bg-foreground/5 px-3 py-2">
          <span className="min-w-0 truncate text-xs text-foreground-secondary">
            {file.name} · {humanSize(file.size)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={<X size={14} />}
            disabled={disabled}
            onClick={() => onSelect(null)}
            aria-label={`Remover ${file.name}`}
          >
            Remover
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Escolher arquivo
        </Button>
      )}
    </div>
  );
}

export function FilePickers({
  csvFile,
  zipFile,
  disabled,
  onSelectCsv,
  onSelectZip,
}: {
  csvFile: File | null;
  zipFile: File | null;
  disabled?: boolean;
  onSelectCsv: (file: File | null) => void;
  onSelectZip: (file: File | null) => void;
}) {
  return (
    <Panel
      title="Arquivos"
      subtitle="Nada é gravado ao escolher: a prévia aparece primeiro, para conferência."
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <FileSlot
          id="import-csv"
          label="Planilha (.csv)"
          hint="Colunas: Área, Subárea, Cargo, Nome Completo, Email do CITi, Celular, Curso, Departamento Acadêmico, Data de Nascimento, Gestão de Entrada e Foto Arquivo."
          accept=".csv,text/csv"
          icon={<FileSpreadsheet size={18} />}
          file={csvFile}
          disabled={disabled}
          onSelect={onSelectCsv}
        />
        <FileSlot
          id="import-zip"
          label="Fotos (.zip, opcional)"
          hint="Cada arquivo é localizado pelo valor da coluna Foto Arquivo. JPEG, PNG ou WebP, até 5 MB cada."
          accept=".zip,application/zip"
          icon={<FileArchive size={18} />}
          file={zipFile}
          disabled={disabled}
          onSelect={onSelectZip}
        />
      </div>
    </Panel>
  );
}
