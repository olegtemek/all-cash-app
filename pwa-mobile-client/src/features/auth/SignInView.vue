<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, ref, watch } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SheetView from '@/design/SheetView.vue'
import SpinnerDot from '@/design/SpinnerDot.vue'
import ServerStatusRow from './ServerStatusRow.vue'
import { authStore as store } from './authStore'
import { AuthRules, authErrorText, type AuthError } from '@/core/model/rules'

const emit = defineEmits<{ close: [] }>()

const validationError = ref<AuthError | null>(null)
const focusedField = ref<'server' | 'login' | null>(null)

const server = computed({
  get: () => store.server.value,
  set: (value: string) => store.setServer(value)
})

const login = computed({
  get: () => store.login.value,
  set: (value: string) => store.setLogin(value)
})

const message = computed(() => validationError.value ?? store.error.value)

const canSubmit = computed(
  () => server.value.length > 0 && login.value.length > 0 && !store.isBusy.value
)

watch(
  () => store.isSignedIn.value,
  (isSignedIn) => {
    if (isSignedIn) emit('close')
  }
)

function resetValidation(): void {
  validationError.value = null
  store.error.value = null
}

function validate(): boolean {
  focusedField.value = null

  const serverError = AuthRules.validateServer(server.value)
  if (serverError) {
    validationError.value = serverError
    return false
  }

  const loginError = AuthRules.validateLogin(login.value)
  if (loginError) {
    validationError.value = loginError
    return false
  }

  validationError.value = null
  return true
}

async function submit(): Promise<void> {
  if (!validate()) return
  await store.signIn()
}

async function register(): Promise<void> {
  if (!validate()) return
  await store.register()
}
</script>

<template>
  <SheetView :open="true" :title="t('auth.signIn')" :cancel-title="t('common.back')" @close="emit('close')">
    <div class="signin">
      <header class="signin__header">
        <span class="signin__mark">
          <AppIcon name="creditcard.fill" :size="32" />
        </span>

        <h2 class="text-title">{{ t('auth.signIn') }}</h2>
        <p class="text-subheadline secondary">
          {{ t('auth.intro') }}
        </p>
      </header>

      <FormCard :title="t('common.server')">
        <FieldRow symbol="server.rack" :is-active="focusedField === 'server'">
          <input
            v-model="server"
            class="signin__input"
            type="url"
            inputmode="url"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            placeholder="sync.example.com"
            @focus="focusedField = 'server'"
            @blur="focusedField = null"
            @input="resetValidation"
          />
        </FieldRow>

        <FormDivider />

        <ServerStatusRow
          :status="store.serverStatus.value"
          :is-enabled="server.length > 0 && !store.isBusy.value"
          @check="store.checkServer()"
        />
      </FormCard>

      <FormCard :title="t('common.login')">
        <FieldRow symbol="person" :is-active="focusedField === 'login'">
          <input
            v-model="login"
            class="signin__input"
            type="text"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            :placeholder="t('auth.yourLogin')"
            @focus="focusedField = 'login'"
            @blur="focusedField = null"
            @input="resetValidation"
            @keyup.enter="submit"
          />
        </FieldRow>
      </FormCard>

      <div class="signin__notes">
        <InlineMessage v-if="message" kind="error" :text="authErrorText(message)" />

      </div>
    </div>

    <template #bottom>
      <div class="signin__bar">
        <AppButton full-width :disabled="!canSubmit" @click="submit">
          <SpinnerDot v-if="store.isBusy.value" />
          <span v-else>{{ t('auth.signInAction') }}</span>
        </AppButton>

        <AppButton v-if="store.canRegister.value" variant="glass" full-width @click="register">
          {{ t('auth.createLogin') }}
        </AppButton>
      </div>
    </template>
  </SheetView>
</template>

<style scoped>
.signin {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-l) var(--space-l) var(--space-xl);
}

.signin__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-m);
  text-align: center;
  padding-top: var(--space-l);
}

.signin__header h2,
.signin__header p {
  margin: 0;
}

.signin__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 76px;
  border-radius: var(--radius-mark);
  background: linear-gradient(135deg, var(--accent), var(--palette-indigo));
  color: #fff;
}

.signin__input {
  width: 100%;
  border: none;
  background: none;
  outline: none;
  font-size: 17px;
}

.signin__notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.signin__bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
</style>
