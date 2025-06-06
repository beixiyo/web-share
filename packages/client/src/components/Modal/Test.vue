<template>
  <div class="p-4 space-y-4">
    <h1 class="text-xl font-bold">Modal Demo</h1>
    <div class="space-x-2 space-y-2">
      <Button
        v-for="type in modalTypes"
        :key="type"
        :class="buttonStyles[type]"
        @click="() => openModal(type)">
        Open {{ type.charAt(0).toUpperCase() + type.slice(1) }} Modal
      </Button>
    </div>

    <h1 class="text-xl font-bold">Imperative Modal Demo</h1>
    <div class="space-x-2 space-y-2">
      <Button
        v-for="type in modalTypes.filter(t => t !== 'custom')"
        :key="type"
        :class="buttonStyles[type]"
        @click="() => modal[type]({
          content: `This is the ${type} of the Imperative modal`,
          onConfirm() {
            console.log(`Imperative ${type} Modal Confirmed`)
          },
          onClose() {
            console.log(`Imperative ${type} Modal Closed`)
          },
        })">
        Open {{ type.charAt(0).toUpperCase() + type.slice(1) }} Modal
      </Button>
    </div>

    <!-- Default Modal -->
    <Modal
      v-model="isDefaultModalOpen"
      title="Default Modal"
      @close="isDefaultModalOpen = false"
      @confirm="handleDefaultConfirm">
      <p>This is the content of the default modal.</p>
    </Modal>

    <!-- Success Modal -->
    <Modal
      v-model="isSuccessModalOpen"
      variant="success"
      title="Success!"
      @close="isSuccessModalOpen = false"
      @confirm="handleSuccessConfirm">
      <p>Your operation was successful.</p>
    </Modal>

    <!-- Warning Modal -->
    <Modal
      v-model="isWarningModalOpen"
      variant="warning"
      title="Warning!"
      @close="isWarningModalOpen = false"
      @confirm="handleWarningConfirm">
      <p>Please be cautious about this action.</p>
    </Modal>

    <!-- Error Modal -->
    <Modal
      v-model="isErrorModalOpen"
      variant="error"
      title="Error!"
      @close="isErrorModalOpen = false"
      @confirm="handleErrorConfirm">
      <p>An error occurred while processing your request.</p>
    </Modal>

    <!-- Info Modal -->
    <Modal
      v-model="isInfoModalOpen"
      variant="info"
      title="Information"
      @close="isInfoModalOpen = false"
      @confirm="handleInfoConfirm">
      <p>Here is some information for you.</p>
    </Modal>

    <!-- Custom Modal -->
    <Modal
      v-model="isCustomModalOpen"
      title="Custom Modal with Long Content"
      ok-text="Confirm"
      cancel-text="Dismiss"
      @close="isCustomModalOpen = false"
      @confirm="handleCustomConfirm">
      <template #footer>
        <div class="w-full flex justify-between px-6 pb-6">
          <Button
            class="rounded bg-gray-400 px-2 py-1 text-white transition duration-200 hover:bg-gray-500"
            @click="isCustomModalOpen = false">
            Learn More
          </Button>
          <div class="space-x-2">
            <Button
              class="rounded bg-gray-400 px-2 py-1 text-white transition duration-200 hover:bg-gray-500"
              @click="isCustomModalOpen = false">
              Dismiss
            </Button>
            <Button
              class="rounded bg-blue-400 px-2 py-1 text-white transition duration-200 hover:bg-blue-500"
              @click="handleCustomConfirm">
              Confirm
            </Button>
          </div>
        </div>
      </template>

      <div class="p-6 space-y-4">
        <p>This modal has custom content and a custom footer.</p>
        <p>You can put any content here.</p>
        <template v-for="i in 10" :key="i">
          <p>This is a long content line {{ i }} to test scrolling behavior if
            the content overflows.</p>
        </template>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Modal from './index.vue'
import { modal } from '@/utils'
import Button from '@/components/Button/index.vue'

defineOptions({ name: 'ModalTest' })

const modalTypes = ['default', 'success', 'warning', 'error', 'info', 'custom'] as const

const isDefaultModalOpen = ref(false)
const isSuccessModalOpen = ref(false)
const isWarningModalOpen = ref(false)
const isErrorModalOpen = ref(false)
const isInfoModalOpen = ref(false)
const isCustomModalOpen = ref(false)

const buttonStyles = {
  default: 'text-white bg-gray-500 hover:bg-gray-600',
  success: 'text-white bg-green-500 hover:bg-green-600',
  warning: 'text-white bg-yellow-500 hover:bg-yellow-600',
  error: 'text-white bg-red-500 hover:bg-red-600',
  info: 'bg-blue-500 hover:bg-blue-600',
  custom: 'text-white bg-purple-500 hover:bg-purple-600',
} as const

function openModal(type: typeof modalTypes[number]) {
  switch (type) {
    case 'default':
      isDefaultModalOpen.value = true
      break
    case 'success':
      isSuccessModalOpen.value = true
      break
    case 'warning':
      isWarningModalOpen.value = true
      break
    case 'error':
      isErrorModalOpen.value = true
      break
    case 'info':
      isInfoModalOpen.value = true
      break
    case 'custom':
      isCustomModalOpen.value = true
      break
  }
}

function handleDefaultConfirm() {
  console.log('Default Modal Confirmed')
  isDefaultModalOpen.value = false
}

function handleSuccessConfirm() {
  console.log('Success Modal Confirmed')
  isSuccessModalOpen.value = false
}

function handleWarningConfirm() {
  console.log('Warning Modal Confirmed')
  isWarningModalOpen.value = false
}

function handleErrorConfirm() {
  console.log('Error Modal Confirmed')
  isErrorModalOpen.value = false
}

function handleInfoConfirm() {
  console.log('Info Modal Confirmed')
  isInfoModalOpen.value = false
}

function handleCustomConfirm() {
  console.log('Custom Modal Confirmed')
  isCustomModalOpen.value = false
}
</script>