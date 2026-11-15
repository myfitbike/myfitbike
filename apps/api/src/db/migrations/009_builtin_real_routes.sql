-- Built-in real roads (PLAN 16.26, World Tour first set): a row prepared from a GPX bundled with the app carries its
-- catalogue key. One per rider; built-ins are not deletable once prepared (rider imports still are).
alter table real_route add column builtin text;
create unique index real_route_builtin on real_route(profile_id, builtin) where builtin is not null;
