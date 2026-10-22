-- 024: a hand order for a single day's list.
--
-- Today is a mixed list: todo mirrors of planned items, loose dated rows, and
-- items that carry their own date. Dragging one to the top therefore cannot be
-- expressed in either table alone, so both get the same column and the list
-- reads whichever the row came from.
--
-- Not sort_order, which already means "position among my siblings in the
-- tree" for items and "position within a day as the API returns it" for
-- todos. Overloading either would make moving a row on Today reshuffle
-- something else.
--
-- Null is unplaced. Unplaced rows keep whatever order the chosen sort gives
-- them, so a hand-placed row rises above a list that is otherwise untouched.
alter table items add column if not exists day_order integer;
alter table todos add column if not exists day_order integer;
