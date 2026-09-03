-- Phase 38: Create AI Action Items Table for Digital CFO Action Center

CREATE TABLE IF NOT EXISTS public.ai_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low', 'red', 'yellow', 'green')),
    headline VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    action_label VARCHAR(100) NOT NULL,
    action_route VARCHAR(255) NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_action_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user isolation
DROP POLICY IF EXISTS "Users can view their own action items" ON public.ai_action_items;
CREATE POLICY "Users can view their own action items"
    ON public.ai_action_items FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own action items" ON public.ai_action_items;
CREATE POLICY "Users can update their own action items"
    ON public.ai_action_items FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own action items" ON public.ai_action_items;
CREATE POLICY "Users can insert their own action items"
    ON public.ai_action_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own action items" ON public.ai_action_items;
CREATE POLICY "Users can delete their own action items"
    ON public.ai_action_items FOR DELETE
    USING (auth.uid() = user_id);

-- Performance Index
CREATE INDEX IF NOT EXISTS idx_ai_action_items_user_resolved 
    ON public.ai_action_items(user_id, is_resolved, created_at DESC);
