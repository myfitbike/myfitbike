-- Imperial display units. Storage, physics and exports stay metric; this only chooses what the rider sees and types.
alter table profile drop constraint if exists profile_units_check;
alter table profile add constraint profile_units_check check (units in ('metric', 'imperial'));
