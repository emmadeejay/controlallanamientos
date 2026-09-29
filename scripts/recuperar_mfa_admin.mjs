// Uso exclusivo ante pérdida del autenticador, desde una terminal local segura.
// node --env-file=.env.local scripts/recuperar_mfa_admin.mjs <user-id> <factor-id> <email>
import { createClient } from '@supabase/supabase-js';

const [userId, factorId, expectedEmail] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!uuid.test(userId ?? '') || !uuid.test(factorId ?? '') || !expectedEmail?.includes('@')) {
  throw new Error('Ingresá user-id, factor-id y correo de la cuenta a recuperar.');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error('Faltan las variables privadas de Supabase.');

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const { data: { user }, error: userError } = await admin.auth.admin.getUserById(userId);
if (userError || !user || user.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
  throw new Error('No coincide el correo con el usuario indicado. No se modificó ningún factor.');
}

const matchingFactor = user.factors?.some(factor => factor.id === factorId);
if (!matchingFactor) throw new Error('El factor no pertenece a ese usuario. No se modificó ningún factor.');

const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id: factorId });
if (error) throw new Error(`No se pudo eliminar el factor: ${error.message}`);
console.log('Factor eliminado. Las sesiones activas fueron revocadas. Iniciá sesión y configurá otro autenticador.');
