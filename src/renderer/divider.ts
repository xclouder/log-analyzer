/**
 * divider.ts - Draggable divider between the two Monaco editor panes.
 *
 * The divider allows users to resize the left (source) and right (filtered)
 * editor panes by clicking and dragging.
 */

let isDragging = false;
let startX = 0;
let initialWidth = 0;

const dividerEl = document.querySelector('.divider') as HTMLElement;
const leftEditorEl = document.getElementById('editor') as HTMLElement;

if (dividerEl && leftEditorEl) {
  dividerEl.addEventListener('mousedown', startDragging);
  document.addEventListener('mousemove', handleDragging);
  document.addEventListener('mouseup', stopDragging);
}

function startDragging(e: MouseEvent): void {
  isDragging = true;
  startX = e.clientX;
  initialWidth = leftEditorEl.getBoundingClientRect().width;
  e.preventDefault();
}

function handleDragging(e: MouseEvent): void {
  if (!isDragging) return;
  const newWidth = initialWidth + (e.clientX - startX);
  if (newWidth > 200) {
    leftEditorEl.style.width = `${newWidth}px`;
    leftEditorEl.style.flex = 'none';
  }
}

function stopDragging(): void {
  if (!isDragging) return;
  isDragging = false;
  // Tell Monaco editors to recalculate their layout
  if ((window as any).editor) (window as any).editor.layout();
  if ((window as any).filteredEditor) (window as any).filteredEditor.layout();
}
