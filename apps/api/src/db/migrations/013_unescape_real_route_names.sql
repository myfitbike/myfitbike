-- World Tour GPX files escape apostrophes, and before the parser decoded XML entities the prepared route was stored
-- as "Alpe d&apos;Huez" (row name and the names inside its world). Decode the entities the content build writes
-- (&apos; &lt; &amp;; &amp; last so "&amp;apos;" stays literal). All three are safe to put back inside JSON text.
update real_route
   set name  = replace(replace(replace(name, '&apos;', ''''), '&lt;', '<'), '&amp;', '&'),
       world = replace(replace(replace(world::text, '&apos;', ''''), '&lt;', '<'), '&amp;', '&')::jsonb
 where name ~ '&(apos|lt|amp);' or world::text ~ '&(apos|lt|amp);';
