import { Directive, ElementRef, HostListener, inject, Input } from '@angular/core';

/**
 * Pulls the host element toward the cursor. By default it only reacts while
 * hovered; set `magneticRadius` to let primary CTAs attract from nearby.
 *
 * Usage: `<button appMagnetic>` or `<button appMagnetic [magneticStrength]="0.5">`
 */
@Directive({
  selector: '[appMagnetic]',
  standalone: true,
  host: { class: 'magnetic-glow' }
})
export class MagneticDirective {
  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
  private isPressed = false;
  private isAttracted = false;
  private readonly canMagnetize =
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  @Input() magneticStrength = 0.35;
  @Input() magneticRadius = 0;

  @HostListener('document:pointermove', ['$event'])
  protected onMove(event: PointerEvent): void {
    if (!this.canMagnetize || event.pointerType !== 'mouse') {
      return;
    }

    if (this.isPressed) {
      return;
    }

    const rect = this.el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);
    const isInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    const radius = Math.max(0, this.magneticRadius);
    const isInField = isInside || (radius > 0 && distance <= radius);

    if (!isInField) {
      this.releaseAttraction();
      return;
    }

    const proximity = isInside || radius === 0 ? 1 : 1 - distance / radius;
    const easedProximity = 1 - Math.pow(1 - proximity, 2);
    const strength = this.magneticStrength * easedProximity;
    const x = deltaX * strength;
    const y = deltaY * strength;

    this.isAttracted = true;
    this.el.classList.add('is-magnetized');
    this.el.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  @HostListener('pointerdown')
  protected onPress(): void {
    this.isPressed = true;
    this.el.style.transition = 'transform 120ms ease';
    this.el.style.transform = this.canMagnetize ? 'translate(0, 1px) scale(0.995)' : 'scale(0.985)';
  }

  @HostListener('pointerup')
  protected onRelease(): void {
    this.isPressed = false;
    this.el.style.transition = this.canMagnetize
      ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
      : 'transform 180ms ease-out';
    this.el.style.transform = 'translate(0, 0)';
  }

  @HostListener('pointerleave')
  @HostListener('pointercancel')
  protected onLeave(): void {
    this.isPressed = false;
    this.releaseAttraction();
  }

  private releaseAttraction(): void {
    if (!this.isAttracted && !this.el.style.transform) {
      return;
    }

    this.isAttracted = false;
    this.el.classList.remove('is-magnetized');
    this.el.style.transition = this.canMagnetize
      ? 'transform 560ms cubic-bezier(0.34, 1.56, 0.64, 1)'
      : 'transform 180ms ease-out';
    this.el.style.transform = 'translate(0, 0)';
  }
}
