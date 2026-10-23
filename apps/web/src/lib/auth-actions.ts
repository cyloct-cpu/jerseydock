'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  changeUserPassword,
  createUser,
  findUserByEmail,
  getSessionUserFull,
  getSessionUserServer,
  sessionCookieOptions,
  signSession,
  touchLogin,
  saveUserAddress,
  deleteUserAddress,
  makeDefaultAddress,
  updateUserProfile,
  verifyPassword,
} from './users';
import { verifyCode as verifyEmailCode } from './verify-code';
import { loginLocked, loginFail, loginOk } from './login-guard';

/**
 * 前台用户：注册 / 登录 / 登出（Server Actions）
 * 错误通过 ?error= 回传到表单页，成功后落会话 cookie 并跳转。
 */

function safeNext(raw: unknown): string {
  const n = String(raw ?? '').trim();
  // 只允许站内路径，防开放跳转
  return n.startsWith('/') && !n.startsWith('//') ? n : '/account';
}

export async function registerAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '');
  const next = safeNext(formData.get('next'));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/register?error=${encodeURIComponent('Please enter a valid email address')}`);
  }
  if (password.length < 8) {
    redirect(`/register?error=${encodeURIComponent('Password must be at least 8 characters')}`);
  }
  if (name.length > 40) {
    redirect(`/register?error=${encodeURIComponent('Name is too long')}`);
  }

  // 邮箱验证码校验（一次性，10 分钟有效）
  try {
    verifyEmailCode(email, 'register', String(formData.get('code') || ''));
  } catch (e) {
    redirect(`/register?error=${encodeURIComponent(e instanceof Error ? e.message : 'Verification failed')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
  }

  let user;
  try {
    user = createUser({ email, name, password });
  } catch (e) {
    redirect(`/register?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not create the account')}`);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
  redirect(next);
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const next = safeNext(formData.get('next'));

  // 暴力破解防护：连续失败 5 次锁定 15 分钟
  const guardKey = email.toLowerCase();
  const lockedFor = loginLocked(guardKey);
  if (lockedFor > 0) {
    redirect(`/login?error=${encodeURIComponent(`尝试次数过多，已临时锁定，请 ${Math.ceil(lockedFor / 60)} 分钟后再试`)}`);
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    loginFail(guardKey);
    redirect(`/login?error=${encodeURIComponent('Wrong email or password')}`);
  }

  loginOk(guardKey);
  touchLogin(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
  redirect(next);
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/');
}

/** 供服务端组件读取当前登录用户（布局 / 账户页） */
export async function currentUser() {
  return getSessionUserServer();
}

// ---------------- 账户中心：资料 / 地址 / 密码 ----------------

/** 更新公开资料（姓名 + 电话） */
export async function updateProfileAction(formData: FormData) {
  const user = await getSessionUserFull();
  if (!user) redirect('/login?next=/account');
  updateUserProfile(user.id, {
    name: String(formData.get('name') || ''),
    phone: String(formData.get('phone') || ''),
    whatsapp: String(formData.get('whatsapp') || ''),
  });
  redirect('/account?saved=profile');
}

/** 保存地址（地址簿：新增或编辑） */
export async function saveAddressAction(formData: FormData) {
  const user = await getSessionUserFull();
  if (!user) redirect('/login?next=/account/addresses');
  saveUserAddress(user.id, {
    entryId: String(formData.get('entryId') || '') || undefined,
    address: String(formData.get('address') || ''),
    city: String(formData.get('city') || ''),
    country: String(formData.get('country') || ''),
    zip: String(formData.get('zip') || ''),
  });
  redirect('/account/addresses?saved=1');
}

/** 删除地址簿条目 */
export async function deleteAddressAction(formData: FormData) {
  const user = await getSessionUserFull();
  if (!user) redirect('/login?next=/account/addresses');
  deleteUserAddress(user.id, String(formData.get('entryId') || ''));
  redirect('/account/addresses?deleted=1');
}

/** 设为默认收货地址（移到地址簿首位） */
export async function setDefaultAddressAction(formData: FormData) {
  const user = await getSessionUserFull();
  if (!user) redirect('/login?next=/account/addresses');
  makeDefaultAddress(user.id, String(formData.get('entryId') || ''));
  redirect('/account/addresses?default=1');
}

/** 修改自己的密码（校验原密码，成功后会话保持有效） */
export async function changePasswordAction(formData: FormData) {
  const user = await getSessionUserFull();
  if (!user) redirect('/login?next=/account/password');
  const oldPassword = String(formData.get('oldPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');

  // 邮箱验证码校验（证明本人操作）
  try {
    verifyEmailCode(user.email, 'password', String(formData.get('code') || ''));
  } catch (e) {
    redirect(`/account/password?error=${encodeURIComponent(e instanceof Error ? e.message : 'Verification failed')}`);
  }

  if (newPassword !== confirm) {
    redirect(`/account/password?error=${encodeURIComponent('The two new passwords do not match')}`);
  }
  const r = changeUserPassword(user.id, oldPassword, newPassword);
  if (!r.ok) {
    redirect(`/account/password?error=${encodeURIComponent(r.error || 'Could not change the password')}`);
  }
  redirect('/account/password?saved=1');
}
