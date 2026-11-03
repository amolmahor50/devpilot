import { useState } from 'react'
import { CreateAccountProps } from './types'

export default function CreateAccount() {
    const [formData, setFormData] = useState<CreateAccountProps>({
        name: '',
        email: '',
        password: ''
    })

    return <div>Login</div>
}
