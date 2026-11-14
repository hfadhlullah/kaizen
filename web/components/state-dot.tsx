// A run's state dot (wait, build, review, done ...). It is the board's own `.si` mark, whose spin and colours live in
// board.html's legacy layer until the side menu moves too (phase 5); one place names that class.
export const StateDot = ({ state }: { state: string }) => <span aria-hidden="true" className={`si ${state}`} />;
