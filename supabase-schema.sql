-- ============================================================================
-- NOSSO BOLSO (GODOY-APP) — Script de Inicialização das Tabelas no Supabase
-- Copie e cole este script no "SQL Editor" do seu painel Supabase e clique em "Run".
-- ============================================================================

-- 1. TABELA: meses (Armazena mês atual, limites de tetos e controle)
CREATE TABLE IF NOT EXISTS public.meses (
  id TEXT PRIMARY KEY,
  mes_atual TEXT,
  current_month TEXT,
  sector_limits JSONB DEFAULT '{}'::JSONB,
  dismissed_recurring JSONB DEFAULT '{}'::JSONB,
  dark_mode BOOLEAN DEFAULT TRUE,
  updated_at BIGINT
);

-- 2. TABELA: salarios (Salários de Gabriel e Mirela vinculados ao mês)
CREATE TABLE IF NOT EXISTS public.salarios (
  mes_ano TEXT PRIMARY KEY,
  referencia_iso TEXT,
  gabriel NUMERIC DEFAULT 0,
  mirela NUMERIC DEFAULT 0,
  soma_casal NUMERIC DEFAULT 0,
  updated_at BIGINT
);

-- 3. TABELA: despesas (Todas as despesas avulsas e compras de cartão/fatura)
CREATE TABLE IF NOT EXISTS public.despesas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  setor TEXT DEFAULT 'mercado',
  responsavel TEXT DEFAULT 'casal',
  mes_ano TEXT,
  referencia_iso TEXT,
  data TEXT,
  hora TEXT DEFAULT '12:00',
  forma_pagamento TEXT DEFAULT 'PIX',
  is_recurring BOOLEAN DEFAULT FALSE,
  subscription_id TEXT,
  image_data_url TEXT,
  image_signature TEXT,
  updated_at BIGINT
);

-- 4. TABELA: gastos_fixos (Assinaturas e despesas fixas recorrentes mensais)
CREATE TABLE IF NOT EXISTS public.gastos_fixos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  dia_vencimento INTEGER DEFAULT 5,
  setor TEXT DEFAULT 'mercado',
  responsavel TEXT DEFAULT 'casal',
  forma_pagamento TEXT DEFAULT 'PIX',
  ativo BOOLEAN DEFAULT TRUE,
  updated_at BIGINT
);

-- Habilitar Row Level Security (RLS) com políticas de leitura e gravação
ALTER TABLE public.meses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos_fixos ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso irrestrito para os usuários do app
DROP POLICY IF EXISTS "Acesso total meses" ON public.meses;
CREATE POLICY "Acesso total meses" ON public.meses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total salarios" ON public.salarios;
CREATE POLICY "Acesso total salarios" ON public.salarios FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total despesas" ON public.despesas;
CREATE POLICY "Acesso total despesas" ON public.despesas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total gastos_fixos" ON public.gastos_fixos;
CREATE POLICY "Acesso total gastos_fixos" ON public.gastos_fixos FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Realtime para atualização instantânea entre PC e Celular
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'meses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meses;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'salarios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salarios;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'despesas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.despesas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'gastos_fixos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_fixos;
  END IF;
END $$;
