-- Perfil do tenant além do nome: WhatsApp (obrigatório na tela) e
-- endereço/cidade/estado (opcionais). Todas NULLABLE — tenants existentes
-- não têm esse dado, e uma coluna NOT NULL sem default quebraria o boot.
ALTER TABLE tenants ADD COLUMN whatsapp text;
ALTER TABLE tenants ADD COLUMN address text;
ALTER TABLE tenants ADD COLUMN city text;
ALTER TABLE tenants ADD COLUMN state text;

-- Trava do slug: o slug nasce igual ao prefixo do e-mail (auth.ts,
-- POST /auth/signup) e só pode ser recalculado UMA VEZ, no primeiro save da
-- tela "Minha Assinatura" (a partir do `name` digitado ali). Depois disso,
-- `slug_locked = true` e nenhum PUT /subscription/profile volta a tocar o
-- slug — só o `name` muda em edições seguintes.
ALTER TABLE tenants ADD COLUMN slug_locked boolean NOT NULL DEFAULT false;

-- Tenants JÁ EXISTENTES nascem TRAVADOS: o default `false` acima vale para
-- linha nova a partir de agora, mas toda conta que já existe pode ter o
-- slug divulgado (link, QR code, cartão) — recalculá-lo por trás seria
-- trocar o endereço de alguém sem aviso. UPDATE sem WHERE, de propósito:
-- cobre tudo que existir no momento em que esta migration roda, e é
-- exatamente o universo que precisa ficar protegido.
UPDATE tenants SET slug_locked = true;

COMMENT ON COLUMN tenants.slug_locked IS
  'true = slug fixo, PUT /subscription/profile não recalcula mais. Nasce true para todo tenant anterior a esta migration (proteção); nasce false para tenant novo (signup), até o primeiro save do perfil travar.';
