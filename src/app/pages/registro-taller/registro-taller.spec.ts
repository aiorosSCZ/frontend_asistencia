import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegistroTaller } from './registro-taller';

describe('RegistroTaller', () => {
  let component: RegistroTaller;
  let fixture: ComponentFixture<RegistroTaller>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistroTaller],
    }).compileComponents();

    fixture = TestBed.createComponent(RegistroTaller);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
