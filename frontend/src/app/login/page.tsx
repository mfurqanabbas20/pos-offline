"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Spinner } from "@/components/common"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { config } from "@/lib/config"

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
})
type LoginValues = z.infer<typeof schema>

export default function LoginPage() {
  const { status, login } = useAuth()
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } })

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard")
  }, [status, router])

  const onSubmit = async ({ username, password }: LoginValues) => {
    try {
      await login(username, password)
      toast.success("Welcome back")
      router.replace("/dashboard")
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 401 ? "Incorrect username or password." : (error as Error).message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-accent/60 to-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-20 drop-shadow-md" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{config.pharmacy.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to the point of sale</p>
          </div>
        </div>
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" autoComplete="username" autoFocus aria-invalid={!!errors.username} {...register("username")} />
                {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
