import type { Note } from '../game/notes';

/** Full-screen scanned-paper view of a note. Text is set with textContent only. */
export function createNoteReader(parent: HTMLElement) {
  const root = document.createElement('div');
  root.id = 'note-reader';
  root.hidden = true;
  const paper = document.createElement('div');
  paper.className = 'paper';
  const title = document.createElement('h2');
  const body = document.createElement('p');
  const hint = document.createElement('p');
  hint.className = 'note-hint';
  hint.textContent = '[E] or click to put it down';
  paper.append(title, body);
  root.append(paper, hint);
  parent.append(root);

  return {
    show(note: Note): void {
      title.textContent = note.title;
      body.textContent = note.body;
    },
    setVisible(visible: boolean): void {
      root.hidden = !visible;
    },
  };
}
