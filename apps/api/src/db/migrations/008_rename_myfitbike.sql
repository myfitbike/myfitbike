-- The app is now MyFitBike (PLAN 16.22). New Strava connections name activities "{name} — MyFitBike"; riders who kept
-- the old default get the new one, custom templates are left alone.
alter table strava_account alter column name_template set default '{name} — MyFitBike';
update strava_account set name_template = '{name} — MyFitBike' where name_template = '{name} — VeloWorld';
