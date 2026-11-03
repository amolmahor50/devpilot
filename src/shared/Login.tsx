import { useState } from 'react'
import { LoginProps } from './types'

export default function login() {
    const [formData, setFormData] = useState<LoginProps>({
        email: '',
        password: ''
    })

    return <div>login</div>
}
