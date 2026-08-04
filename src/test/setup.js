import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount anything a test rendered, so a stuck component from one test cannot
// receive events in the next.
afterEach(cleanup)
