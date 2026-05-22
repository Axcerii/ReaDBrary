/**
 * Manual mock for @thallesp/nestjs-better-auth
 *
 * This prevents Jest from loading the ESM-only better-auth dependency chain
 * (better-auth → better-call → rou3, etc.) which is incompatible with
 * Jest's CommonJS runtime.
 *
 * All exports are lightweight stubs that satisfy NestJS's module system.
 */
import { Module, Injectable, CanActivate } from '@nestjs/common';

// --- Symbols ---
export const BEFORE_HOOK_KEY = Symbol('BEFORE_HOOK');
export const AFTER_HOOK_KEY = Symbol('AFTER_HOOK');
export const HOOK_KEY = Symbol('HOOK');
export const AUTH_MODULE_OPTIONS_KEY = Symbol('AUTH_MODULE_OPTIONS');

// --- Decorators ---
export const AllowAnonymous = () => (_target: any) => {};
export const OptionalAuth = () => (_target: any) => {};
export const Public = AllowAnonymous;
export const Optional = OptionalAuth;
export const Roles = (_roles: any) => (_target: any) => {};
export const OrgRoles = (_roles: any) => (_target: any) => {};
export const Session = () => (_target: any, _key: string, _index: number) => {};
export const BeforeHook = (_path: any) => (_target: any) => {};
export const AfterHook = (_path: any) => (_target: any) => {};
export const Hook = () => (_target: any) => {};

// --- Guard ---
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

// --- Service ---
@Injectable()
export class AuthService {}

// --- Module ---
@Module({
  providers: [AuthService, AuthGuard],
  exports: [AuthService],
})
export class AuthModule {
  static forRoot(_options?: any) {
    return {
      module: AuthModule,
      providers: [AuthService, AuthGuard],
      exports: [AuthService],
    };
  }

  static forRootAsync(_options?: any) {
    return {
      module: AuthModule,
      providers: [AuthService, AuthGuard],
      exports: [AuthService],
    };
  }
}
