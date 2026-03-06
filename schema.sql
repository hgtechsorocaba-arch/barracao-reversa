-- Script para criação da tabela de produtos no Supabase

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
-- Recomendável em produção limitar isso no futuro
CREATE POLICY "Escrita para todos" ON public.products
    FOR ALL USING (true) WITH CHECK (true);
