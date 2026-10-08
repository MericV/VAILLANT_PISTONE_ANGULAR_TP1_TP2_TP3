import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { MatPaginatorIntl } from "@angular/material/paginator";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';
import { FrenchPaginatorIntl } from './app/shared/i18n/paginator-intl';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    // withXhr() : depuis Angular 21, HttpClient utilise fetch par défaut, qui ne
    // remonte pas la progression d'upload. Le backend XHR est requis pour les
    // événements HttpEventType.UploadProgress utilisés par TrackService.upload().
    provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
    { provide: MatPaginatorIntl, useClass: FrenchPaginatorIntl },
  ],
}).catch(console.error);
