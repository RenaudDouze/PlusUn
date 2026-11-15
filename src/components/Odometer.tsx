import { AnimatePresence, motion } from 'framer-motion'
import { digitMotion } from './odometerMotion'

interface DigitProps {
  char: string
  direction: 1 | -1
}

function Digit({ char, direction }: DigitProps) {
  return (
    <span className="odometer-digit">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          className="odometer-digit-inner"
          {...digitMotion(direction)}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

interface OdometerProps {
  value: number
  direction: 1 | -1
}

export function Odometer({ value, direction }: OdometerProps) {
  const text = value.toString()
  const chars = text.split('')

  return (
    <span className="odometer">
      {chars.map((char, i) => (
        <Digit key={chars.length - i} char={char} direction={direction} />
      ))}
    </span>
  )
}
