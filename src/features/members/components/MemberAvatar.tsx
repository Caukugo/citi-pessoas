import { useQueryClient } from '@tanstack/react-query';
import { Avatar, type AvatarSize } from '@/components/ui';
import { queryKeys, useMemberPhotoUrl, type Member } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A FOTO DO MEMBRO, vinda de um bucket PRIVADO.
 *
 * `members.photo_path` guarda só o caminho dentro do bucket `member-photos`.
 * Não existe link público e não vai existir: a exibição pede uma URL ASSINADA,
 * que vale por uma hora e não é guardada em lugar nenhum.
 *
 * TRÊS COISAS QUE ESTE COMPONENTE RESOLVE, e que um `<img src={...}>` solto
 * não resolveria:
 *
 *   1. UMA assinatura por caminho, em cache. A listagem com setenta pessoas
 *      pede setenta URLs — não uma por renderização. Quem já viu a pessoa em
 *      outra tela reaproveita a mesma.
 *
 *   2. Enquanto a assinatura não chega, aparecem as INICIAIS, não um vazio
 *      pulando. A foto entra por cima quando estiver pronta.
 *
 *   3. Assinatura expirada (aba aberta desde ontem) faz a imagem falhar. Aí a
 *      foto some, as iniciais voltam e uma URL nova é pedida — em vez de um
 *      quadrado quebrado no lugar do rosto de alguém.
 *
 * Sem `photoPath`, nada é consultado: a pessoa não tem foto, e as iniciais são
 * a resposta certa — não um estado de erro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function MemberAvatar({
  member,
  size = 'sm',
  shape = 'rounded',
  className,
}: {
  member: Pick<Member, 'fullName' | 'photoUrl' | 'photoPath'>;
  size?: AvatarSize;
  shape?: 'rounded' | 'circle';
  className?: string;
}) {
  const queryClient = useQueryClient();
  const path = member.photoPath ?? null;
  const { data: signedUrl } = useMemberPhotoUrl(path);

  // `photoUrl` é a foto EXTERNA de cadastros antigos, anterior ao bucket. A
  // assinada tem precedência: é a que a importação passou a gravar.
  const url = signedUrl ?? member.photoUrl ?? null;

  return (
    <Avatar
      name={member.fullName}
      photoUrl={url}
      size={size}
      shape={shape}
      className={className}
      onPhotoError={() => {
        if (!path) return;
        // A assinatura provavelmente expirou. Invalidar (em vez de refetch
        // direto) faz TODAS as telas que mostram esta pessoa receberem a URL
        // nova de uma vez.
        void queryClient.invalidateQueries({ queryKey: queryKeys.members.photo(path) });
      }}
    />
  );
}
