import React from 'react';
import { Helmet } from 'react-helmet';

const MetaTags = ({ title, description }) => {
  const siteTitle = 'G3Z Creative';
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
    </Helmet>
  );
};

export default MetaTags;