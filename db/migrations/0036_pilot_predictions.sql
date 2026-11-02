-- What a friend thinks a friend would do (C76): each rating gains the six answers given about the other
-- person, in the same shape as the person's own (`pilot_people.stated`). With it the pilot compares three
-- witnesses to what someone actually does in the village: their own words, their friends' words, and the
-- echo. Null where the friend would rather not say, and always for someone they do not know.

alter table pilot_ratings add column if not exists predicted jsonb;
