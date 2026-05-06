-- Full-text search across SOP titles and content

-- Step 1: Function to extract plain text from Tiptap JSON
create or replace function extract_tiptap_text(content jsonb) returns text
language sql immutable as $$
  select coalesce(
    string_agg(node->>'text', ' '),
    ''
  )
  from jsonb_path_query(content, '$.** ? (@.type == "text")') as node
  where node->>'text' is not null
$$;

-- Step 2: Add generated search vector column
-- Title is weighted A (higher priority), content weighted B
alter table sops add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(extract_tiptap_text(content), '')), 'B')
  ) stored;

-- Step 3: GIN index for fast full-text search
create index if not exists sops_search_vector_idx on sops using gin(search_vector);
