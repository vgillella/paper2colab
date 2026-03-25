import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        Paper2Colab
      </h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Turn any research paper into a production-quality Colab tutorial.
      </p>
      <div className="w-full max-w-md space-y-4">
        <Input
          type="password"
          placeholder="OpenAI API Key"
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
        <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          Generate Notebook
        </Button>
      </div>
    </main>
  );
}
