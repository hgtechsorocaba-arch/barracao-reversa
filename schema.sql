-- Para aplicar no painel SQL do Supabase:
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Script completo de criação (caso queira recriar do zero):

-- Tabela: products
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    condition TEXT,
    price NUMERIC(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    urgent BOOLEAN DEFAULT false,
    image TEXT, -- URL da imagem principal
    images TEXT[], -- Array de URLs de imagens adicionais
    video_url TEXT, -- URL do vídeo (opcional)
    variations JSONB, -- Variações do produto (ex: cores, tamanhos)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Política 1: Qualquer pessoa pode ler os produtos (Público)
CREATE POLICY "Produtos são públicos" ON public.products
    FOR SELECT USING (true);

-- Política 2: Escrita para todos (Anon) - Mantenha por simplicidade se for testar agora
-- Tabela: whatsapp_groups (NOVO)
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    invite_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS e Políticas para whatsapp_groups
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Grupos são públicos" ON public.whatsapp_groups FOR SELECT USING (true);
CREATE POLICY "Escrita para todos grupos" ON public.whatsapp_groups FOR ALL USING (true) WITH CHECK (true);

